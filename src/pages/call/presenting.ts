/**
 * Files a teacher presents in a class: pictures and PDFs, put on whiteboard pages.
 *
 * A tablet's browser cannot share its screen, but it can draw the whiteboard, which the
 * class already sees as the teacher's screen share. So a presented file becomes board pages,
 * one per picture and one per PDF page, each with the file drawn under the teacher's ink.
 *
 * The files are kept in this browser (IndexedDB) for a few days, so a page reloaded in the
 * middle of a lesson finds them again; a board page only names its file. Pages are drawn
 * from the file when they are shown, and a few drawn pages are kept ready in memory.
 */

import { BOARD_HEIGHT, BOARD_WIDTH } from './board-size'

/** A board page's picture: a kept file, and for a PDF which of its pages. */
export type PictureRef = { file: string; page?: number }

export type PictureState =
  | { status: 'ready'; image: HTMLCanvasElement }
  | { status: 'loading' }
  | { status: 'missing' }

export type ImportResult = {
  pictures: PictureRef[]
  /** Names of files that could not be opened. */
  skipped: string[]
  /** A PDF had more pages than are put on the board. */
  truncated: boolean
}

/** More pages than this from one PDF are left out: a lesson does not need a whole book. */
export const MAX_PDF_PAGES = 100
const KEEP_DAYS = 3
const READY_LIMIT = 8

// ---------------------------------------------------------------------------
// Kept files

type Kept = { id: string; blob: Blob; at: number }

const DB_NAME = 'h7lms.present'
const STORE = 'files'
const memory = new Map<string, Blob>()
let database: Promise<IDBDatabase | null> | null = null

/** The browser's file store, or null where there is none (some private windows). */
function openDb(): Promise<IDBDatabase | null> {
  database ??= new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, 1)
      request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' })
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
      request.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  return database
}

async function withStore<T>(mode: IDBTransactionMode, use: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await openDb()
  if (!db) return undefined
  return new Promise<T | undefined>((resolve) => {
    try {
      const request = use(db.transaction(STORE, mode).objectStore(STORE))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(undefined)
    } catch {
      resolve(undefined)
    }
  })
}

let tidied = false
/** Files from lessons a few days back are not wanted any more. */
async function tidy() {
  if (tidied) return
  tidied = true
  const db = await openDb()
  if (!db) return
  try {
    const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000
    const request = db.transaction(STORE, 'readwrite').objectStore(STORE).openCursor()
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) return
      if (((cursor.value as Kept).at ?? 0) < cutoff) cursor.delete()
      cursor.continue()
    }
  } catch {
    // Tidying is only housekeeping.
  }
}

async function keep(blob: Blob): Promise<string> {
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  memory.set(id, blob)
  void tidy()
  await withStore('readwrite', (store) => store.put({ id, blob, at: Date.now() } satisfies Kept))
  return id
}

async function kept(id: string): Promise<Blob | null> {
  const inMemory = memory.get(id)
  if (inMemory) return inMemory
  const found = (await withStore('readonly', (store) => store.get(id))) as Kept | undefined
  if (!found?.blob) return null
  memory.set(id, found.blob)
  return found.blob
}

// ---------------------------------------------------------------------------
// Reading files

type PdfDoc = Awaited<ReturnType<typeof import('pdfjs-dist/legacy/build/pdf.mjs').getDocument>['promise']>

let pdfjs: Promise<typeof import('pdfjs-dist/legacy/build/pdf.mjs')> | null = null
/** The legacy build: the modern one needs newer browsers than many school tablets have. */
function loadPdfjs() {
  pdfjs ??= (async () => {
    const lib = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const { default: workerUrl } = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')
    lib.GlobalWorkerOptions.workerSrc = workerUrl
    return lib
  })()
  return pdfjs
}

const pdfDocs = new Map<string, Promise<PdfDoc>>()
function pdfDoc(file: string, blob?: Blob): Promise<PdfDoc> {
  let doc = pdfDocs.get(file)
  if (!doc) {
    doc = (async () => {
      const source = blob ?? (await kept(file))
      if (!source) throw new Error('missing')
      const lib = await loadPdfjs()
      return lib.getDocument({ data: new Uint8Array(await source.arrayBuffer()) }).promise
    })()
    pdfDocs.set(file, doc)
    doc.catch(() => pdfDocs.delete(file))
  }
  return doc
}

const isPdf = (file: File) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
const isImage = (file: File) => file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp)$/i.test(file.name)

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob)
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('unreadable picture'))
    }
    img.src = url
  })
}

/** A canvas the size of `width` x `height` scaled to fit the board, never larger. */
function fittedCanvas(width: number, height: number) {
  const scale = Math.min(BOARD_WIDTH / width, BOARD_HEIGHT / height, 1)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  return { canvas, scale }
}

/**
 * A photo straight off a tablet camera is far bigger than the board; it is kept at board
 * size, which is all the class can see, so it takes little room and draws quickly.
 */
async function boardSizedPicture(file: File): Promise<Blob> {
  const img = await loadImage(file)
  const { canvas } = fittedCanvas(img.naturalWidth, img.naturalHeight)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no canvas')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  const sharp = /png|gif/i.test(file.type) || /\.(png|gif)$/i.test(file.name)
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, sharp ? 'image/png' : 'image/jpeg', 0.92),
  )
  if (!blob) throw new Error('no picture')
  return blob
}

/** Keeps the chosen files and returns a board page for each picture and PDF page. */
export async function importFiles(files: File[]): Promise<ImportResult> {
  const result: ImportResult = { pictures: [], skipped: [], truncated: false }
  for (const file of files) {
    try {
      if (isPdf(file)) {
        const doc = await pdfDoc(`new:${file.name}:${file.size}`, file)
        pdfDocs.delete(`new:${file.name}:${file.size}`)
        const id = await keep(file)
        pdfDocs.set(id, Promise.resolve(doc))
        const count = Math.min(doc.numPages, MAX_PDF_PAGES)
        if (doc.numPages > MAX_PDF_PAGES) result.truncated = true
        for (let page = 1; page <= count; page += 1) result.pictures.push({ file: id, page })
      } else if (isImage(file)) {
        result.pictures.push({ file: await keep(await boardSizedPicture(file)) })
      } else {
        result.skipped.push(file.name)
      }
    } catch {
      result.skipped.push(file.name)
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// Drawing pages

const keyOf = (ref: PictureRef) => `${ref.file}#${ref.page ?? 0}`
const ready = new Map<string, HTMLCanvasElement>()
const pending = new Set<string>()
const missing = new Set<string>()
const listeners = new Set<() => void>()

/** Called whenever a picture has been drawn and can be shown. */
export function onPictureReady(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

async function render(ref: PictureRef): Promise<HTMLCanvasElement> {
  if (ref.page) {
    const doc = await pdfDoc(ref.file)
    const page = await doc.getPage(ref.page)
    const base = page.getViewport({ scale: 1 })
    const { canvas, scale } = fittedCanvas(base.width * 4, base.height * 4)
    const viewport = page.getViewport({ scale: scale * 4 })
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no canvas')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvas, canvasContext: ctx, viewport }).promise
    page.cleanup()
    return canvas
  }
  const blob = await kept(ref.file)
  if (!blob) throw new Error('missing')
  const img = await loadImage(blob)
  const { canvas } = fittedCanvas(img.naturalWidth, img.naturalHeight)
  canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas
}

/** Starts drawing a picture if it is not drawn already, e.g. the next page ahead of time. */
export function preparePicture(ref: PictureRef | undefined) {
  if (!ref) return
  const key = keyOf(ref)
  if (ready.has(key) || pending.has(key) || missing.has(key)) return
  pending.add(key)
  render(ref)
    .then((canvas) => {
      ready.set(key, canvas)
      // Only a few drawn pages are kept; the oldest goes first.
      while (ready.size > READY_LIMIT) ready.delete(ready.keys().next().value as string)
    })
    .catch(() => missing.add(key))
    .finally(() => {
      pending.delete(key)
      listeners.forEach((listener) => listener())
    })
}

/** The picture as it stands now; one not drawn yet is started. */
export function peekPicture(ref: PictureRef): PictureState {
  const key = keyOf(ref)
  const image = ready.get(key)
  if (image) {
    // Recently shown, so last to be let go.
    ready.delete(key)
    ready.set(key, image)
    return { status: 'ready', image }
  }
  if (missing.has(key)) return { status: 'missing' }
  preparePicture(ref)
  return { status: 'loading' }
}

/** Draws a page's picture as large as fits, in the middle of the board. */
export function drawPicture(ctx: CanvasRenderingContext2D, state: PictureState) {
  if (state.status === 'ready') {
    const { image } = state
    const scale = Math.min(BOARD_WIDTH / image.width, BOARD_HEIGHT / image.height)
    const width = image.width * scale
    const height = image.height * scale
    ctx.drawImage(image, (BOARD_WIDTH - width) / 2, (BOARD_HEIGHT - height) / 2, width, height)
    return
  }
  ctx.save()
  ctx.fillStyle = '#64748b'
  ctx.font = '500 40px system-ui, -apple-system, "Segoe UI", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(
    state.status === 'loading' ? 'Opening the file…' : 'This file is no longer on this device. Present it again.',
    BOARD_WIDTH / 2,
    BOARD_HEIGHT / 2,
  )
  ctx.restore()
}
