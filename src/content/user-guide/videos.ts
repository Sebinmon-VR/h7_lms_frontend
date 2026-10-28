/**
 * Video walkthroughs for the User Guide.
 *
 * The links are added by an admin on the Guide videos page (Admin > System > Guide Videos)
 * and kept on the server, keyed by topic id - nothing here needs editing to add one. A topic
 * shows a video only when it has a link that plays inside the page:
 *
 *   - OneDrive or SharePoint: the address from the video's Embed code (the whole embed code
 *     may be pasted; its address is taken out). A plain share link cannot play inside
 *     another site, so it is pointed out rather than accepted.
 *   - Google Drive: a file link, shared with "Anyone with the link".
 *   - YouTube: any video link.
 */

/** A pasted embed code becomes its address; anything else is returned trimmed. */
export function normalizeVideoLink(link: string | undefined | null): string {
  const text = (link ?? '').trim()
  const iframe = text.match(/<iframe[^>]*\ssrc=["']([^"']+)["']/i)
  return (iframe ? iframe[1] : text).replace(/&amp;/g, '&').trim()
}

/** The address that plays a video inside the page, or null when there is no usable link. */
export function videoEmbedUrl(link: string | undefined | null): string | null {
  const url = normalizeVideoLink(link)
  if (!url) return null

  // OneDrive (personal), and OneDrive for work or school / SharePoint, embed addresses play as they are.
  if (/^https:\/\/onedrive\.live\.com\/embed\?/i.test(url)) return url
  if (/^https:\/\/[a-z0-9-]+\.sharepoint\.com\/.+\/embed\.aspx\?/i.test(url)) return url

  const drive = url.match(/drive\.google\.com\/file\/d\/([^/?#]+)/) ?? url.match(/drive\.google\.com\/.*[?&]id=([^&#]+)/)
  if (drive) return `https://drive.google.com/file/d/${drive[1]}/preview`

  const youtube =
    url.match(/youtube\.com\/watch\?(?:.*&)?v=([\w-]{6,})/) ??
    url.match(/youtu\.be\/([\w-]{6,})/) ??
    url.match(/youtube\.com\/(?:embed|shorts)\/([\w-]{6,})/)
  if (youtube) return `https://www.youtube-nocookie.com/embed/${youtube[1]}`

  return null
}

/** Why a link cannot play in the guide, in plain words, or null when it can (or is empty). */
export function videoLinkProblem(link: string | undefined | null): string | null {
  const url = normalizeVideoLink(link)
  if (!url || videoEmbedUrl(url)) return null
  if (/^https:\/\/1drv\.ms\//i.test(url) || /sharepoint\.com\/:v:\//i.test(url) || /onedrive\.live\.com\//i.test(url)) {
    return 'This is a OneDrive share link, which cannot play inside another site. In OneDrive, choose Embed for the video and paste that code here.'
  }
  return 'This link cannot play in the guide. Use a OneDrive embed code, a Google Drive link or a YouTube link.'
}
