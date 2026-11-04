import type { GuideTopic } from './types'

/** Teachers: exams, from setting a paper to releasing results. */
export const TEACHER_EXAM_TOPICS: GuideTopic[] = [
  {
    id: 'teacher-exam-setting',
    title: 'Setting an exam',
    summary: 'Create the exam, add its paper, and choose when students can sit it.',
    sections: [
      {
        heading: 'Create it',
        steps: [
          'Open **Exams** and press **New exam**.',
          'Choose the class, subject and title.',
          'Pick the **Mode**: **Online form** (students answer questions in the LMS) or **Upload paper** (you upload a question paper; students upload their answers).',
          'Under **When**, set **Opens** and **Closes**. Add **Time per student** if each student gets a fixed number of minutes from pressing start.',
          'Under **Marking**, choose marks or grades and what the exam is out of. Save it - it is a draft that students cannot see.',
        ],
      },
      {
        heading: 'Add the paper',
        points: [
          '**Online form** - open the exam’s **Paper** tab and add questions (multiple choice, true/false, short or long answer, number, file upload). Set the answer key to have objective questions marked for you.',
          '**Upload paper** - on the exam page, drop the question paper (PDF, Word document or image) into **Question paper**. Uploading again replaces it. Press **View** to check it.',
        ],
      },
      {
        heading: 'Publish it',
        points: [
          'Press **Publish to class** when it is ready. Students see it in their list, and it opens by itself at the start time.',
          'Or turn on **Publish automatically** when drafting, with a **Publish at** time (blank means when the exam opens). It must have its questions or paper by then; if not, the exam page says why it waited.',
          'Turn on **Sit with live invigilation** to have students sit it in a live room with their cameras on while you watch.',
        ],
      },
    ],
    tips: [
      'A draft is never seen by students, even after its start time.',
      'Publish a day early so the exam appears in students’ alerts in good time.',
    ],
    keywords: ['create exam', 'new exam', 'question paper', 'upload paper', 'publish', 'auto publish', 'draft', 'online form'],
  },
  {
    id: 'teacher-exam-invigilating',
    title: 'Running a live-invigilated exam',
    summary: 'Watch your students sit the exam in a live room, with their progress beside the cameras.',
    steps: [
      'On your **Dashboard**, find the exam under **Exams today** and press **Open exam room** (it opens 30 minutes before the exam). You can also press **Open exam room** on the exam’s page.',
      'Allow the camera and microphone when the browser asks. You join straight away; your camera and microphone start on.',
      'The students’ cameras fill the main screen. The panel on the right shows how many are **Writing**, **Away**, **Handed in** and **Not started**, a list of every student, and the question paper.',
      'If a student leaves the exam, a message pops up and their row shows **Away since** the time they left. Their time keeps running.',
    ],
    tips: [
      'Students’ microphones start off so a full class is not one open line; they can switch theirs on.',
      'Exam rooms are not recorded.',
    ],
    keywords: ['invigilate', 'proctor', 'exam room', 'camera', 'watch students', 'away'],
  },
  {
    id: 'teacher-exam-marking',
    title: 'Marking scripts',
    summary: 'Read each student’s answers, give marks part by part, and let the LMS add them up.',
    sections: [
      {
        heading: 'Open a script',
        steps: [
          'Open the exam, go to its **Scripts** tab, and choose a student.',
          'Answer sheets open inside the page. Use **View**, or the full-screen button, to read one at full size.',
        ],
      },
      {
        heading: 'Mark on the answer sheet',
        steps: [
          'Press **Mark on the answer sheet**.',
          'With **Draw lines** on, click across the page under each answer. Each part gets a box with its name (Q1, Q2...), the marks given and, if you like, what it is worth.',
          'Drag a line’s red grip to move it, or press its **×** to remove it.',
          'Switch to **Select parts** to pick a part and add a comment.',
          'Check the **Total**, **Percentage** and **Grade** at the bottom, then press **Record marks**. **Save for later** keeps your lines to finish another time.',
        ],
      },
      {
        heading: 'Or enter the total',
        points: [
          'Type the marks into **Marks for the whole paper**. On a graded exam, leave the grade empty and it is worked out from the marks, or choose one yourself.',
          'Press **Save**, or **Save & next** to go straight to the next student.',
          '**Hand back** returns a script to the student if it was handed in by mistake.',
        ],
      },
      {
        heading: 'Release the results',
        points: ['Students see nothing until you press **Publish results** on the exam page. Marks recorded on a graded exam also count towards report cards.', 'Give one student more time on the exam’s **Extra time** tab.'],
      },
    ],
    keywords: ['mark', 'grade', 'score', 'answer sheet', 'evaluate', 'results', 'publish results', 'hand back'],
  },
]

/** Teachers: leave, and someone else taking a period. */
export const TEACHER_LEAVE_TOPIC: GuideTopic = {
  id: 'teacher-leave-substitutes',
  title: 'Leave and substitutes',
  summary: 'Apply for leave, and arrange for another teacher to take your periods - only on the days you choose.',
  sections: [
    {
      heading: 'Apply for leave',
      steps: [
        'Open **Leave & Substitutes** and press **Apply for leave**.',
        'Choose the kind of leave, how much (a full or half day) and the dates.',
        'Under **Classes that need a substitute**, untick any class that needs no cover, and use **Choose substitute** to pick who takes each one.',
        'Add a reason if you like and press **Submit request**.',
      ],
    },
    {
      heading: 'What happens next',
      points: [
        'The chosen substitutes take your classes on your leave days once the leave is approved; every other day stays on the usual timetable.',
        'If a substitute is already teaching at that time, the request shows it under **Still needs a substitute**.',
        'Withdrawing an approved leave gives the periods back to you.',
      ],
    },
    {
      heading: 'A substitute without leave',
      steps: [
        'Press **Arrange a substitute** at the top of the page (or **Arrange substitute** beside a period under **Substitutes by day**).',
        'Choose the date, the period and the teacher, then press **Set substitute**.',
        'To undo it, press **Take the cover back** beside that period.',
      ],
    },
  ],
  keywords: ['leave', 'absent', 'holiday', 'cover', 'substitute', 'swap class', 'exchange'],
}
