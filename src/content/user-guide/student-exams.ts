import type { GuideTopic } from './types'

/** Students: sitting exams, in an exam room or not. */
export const STUDENT_EXAM_TOPICS: GuideTopic[] = [
  {
    id: 'student-exams',
    title: 'Sitting an exam',
    summary: 'Start the exam when it opens, answer or upload your work, and hand it in before the time runs out.',
    sections: [
      {
        heading: 'Starting',
        steps: [
          'When an exam is open, your **Home** page shows it at the top in red. Press **Start exam** (or open **Exams** and choose it).',
          'Read the instructions, then press **Start the exam**. If the exam has a time limit, the clock starts now and does not pause.',
          'While you are sitting it, the rest of the LMS is locked so you stay on the exam.',
        ],
      },
      {
        heading: 'Answering an online form',
        points: [
          'Answer each question in the page. Your answers save as you go - the bar at the top says **Saved**.',
          'Some questions let you add a file, such as a photo of a diagram.',
        ],
      },
      {
        heading: 'Answering an uploaded paper',
        steps: [
          'The question paper opens in the page. Scroll it, or zoom with its own buttons.',
          'Write your answers on paper or in a document.',
          'Under **Your answer sheets**, drop a PDF, Word document or photo of every page, or press **choose a file**.',
          'Press **View** to check a file. Uploaded the wrong one? Press the bin, then **Remove** to confirm, and upload it again.',
        ],
      },
      {
        heading: 'Handing in',
        steps: [
          'Press **Hand in** at the top and confirm.',
          'If the time runs out first, the exam is handed in for you with everything you saved.',
        ],
      },
    ],
    tips: [
      'Uploads have a little extra time after the deadline, but they are marked late.',
      'Your marks appear in **Exams** and **My Marks** once your teacher publishes the results.',
    ],
    keywords: ['exam', 'test', 'start exam', 'upload answers', 'answer sheet', 'hand in', 'submit', 'timer'],
  },
  {
    id: 'student-exam-room',
    title: 'Exams in a live exam room',
    summary: 'Some exams are sat in a live room with your camera on while your teacher watches.',
    sections: [
      {
        heading: 'Joining',
        steps: [
          'From 15 minutes before the exam, your **Home** page shows **Join exam room**. Press it.',
          'Allow the camera and microphone when the browser asks. You join by yourself - there is no extra button to press.',
          'Your camera comes on; your microphone starts off. The paper fills the screen, with the cameras and **Your answer sheets** on the right.',
          'Press **Start the exam**, answer, upload your work and press **Hand in**, just as in any exam.',
        ],
      },
      {
        heading: 'If you need to leave',
        steps: [
          'Press **Leave** at the top of the exam.',
          'Read the warning: **your exam time keeps running while you are away**. If you are not back before it closes, it closes with only what you saved. Your teacher sees that you left.',
          'Press **Leave the exam** to go, or **Stay in the exam** to carry on.',
          'To come back, press **Return to exam** on the yellow banner at the top of any page.',
        ],
      },
    ],
    tips: [
      'Keep your camera on for the whole exam; your teacher can see when it is off.',
      'Closing the tab also counts as leaving.',
    ],
    keywords: ['exam room', 'invigilation', 'camera', 'live exam', 'leave exam', 'return to exam'],
  },
]
