import { GETTING_STARTED } from './common'
import { TEACHER_EXAM_TOPICS, TEACHER_LEAVE_TOPIC } from './teacher-exams'
import type { GuidePart } from './types'

/** The teachers' guide. Students never see it. */
export const TEACHER_GUIDE: GuidePart[] = [
  GETTING_STARTED,
  {
    id: 'teacher-day',
    title: 'Your day',
    topics: [
      {
        id: 'teacher-home',
        title: 'Your dashboard',
        summary: 'What needs doing today: exams, your live class, registers to take and topics to log.',
        sections: [
          {
            heading: 'What you see',
            points: [
              '**Exams today** at the top - exams running now or starting in the next day, with **Open exam room** for a live-invigilated one.',
              'Quick buttons: **Take the register**, **Log a topic**, **Upload material** and **Set up a live class**.',
              'Your live class card: **Join the class**, **Open the room** or **Back to the class**, and **Leave the class**.',
              '**Class over — what did you cover?** after a period: press **Log the topic** to record it, already filled in.',
              '**Registers still to take today**, with one button per class and subject.',
            ],
          },
        ],
        tips: ['If you lead a class you see a **Class teacher** badge, and you also see what other teachers record for that class.'],
        keywords: ['dashboard', 'home', 'today'],
      },
      {
        id: 'teacher-classes-timetable',
        title: 'My classes and timetable',
        summary: 'The classes and subjects you teach, and when each lesson is.',
        steps: [
          'Open **My Classes**. Each subject card shows its students, topics, materials and meetings, with **Attendance** and **Grades** buttons.',
          'Class teachers also see **Classes you lead**, with **Attendance**, **Syllabus** and **Grades** for the whole class.',
          'Open **Timetable**. **Whole week** shows the week and what is coming up; **One day** shows a single day - use the arrows and **Back to today**.',
        ],
        tips: ['A period a substitute is taking for you on a given day leaves your timetable for that day only.'],
        keywords: ['classes', 'subjects', 'timetable', 'schedule'],
      },
      {
        id: 'teacher-attendance',
        title: 'Taking the register',
        summary: 'Mark a whole class in one pass, and correct it later if you need to.',
        sections: [
          {
            heading: 'Take it',
            steps: [
              'Open **Attendance**.',
              'Choose the **Class** and **Subject**, and check the **Date**.',
              'Everyone starts as **Present**. Change anyone who is **Absent**, **Late** or **Excused** - or use **All present** / **All absent**.',
              'Add a note for a student with the remarks button if you need to.',
              'Press **Save attendance**.',
            ],
          },
          {
            heading: 'Correct it',
            steps: [
              'Choose the same class, subject and date - the page says the register was already taken.',
              'Change the marks and press **Update attendance**.',
              'Wrong date altogether? Press **Delete this day**, then **Delete records**.',
            ],
          },
        ],
        tips: ['**Keyboard mode** lets you mark the register from the keyboard.'],
        keywords: ['attendance', 'register', 'present', 'absent', 'late'],
      },
    ],
  },
  {
    id: 'teacher-classroom',
    title: 'Classroom',
    topics: [
      {
        id: 'teacher-live-classes',
        title: 'Live classes and the whiteboard',
        summary: 'Teach in your class’s room in the LMS, with a whiteboard the class can see.',
        sections: [
          {
            heading: 'Your class room',
            steps: [
              'When your period comes round, press **Join the class** on your **Dashboard** or in **Live Classes**.',
              'Allow your camera and microphone. Students are already in the room; you join them.',
              'Press **Leave the class** when your period ends.',
            ],
          },
          {
            heading: 'A session outside the timetable',
            steps: [
              'In **Live Classes**, press **Schedule meeting**.',
              'Choose the **Class** and **Subject**, give it a **Title**, and set **Scheduled for** and **Duration**.',
              'Leave **Record this class automatically** on if you want a recording, then press **Schedule meeting**.',
              'At the time, press **Open the class**, then **Join**. Press **End class** when you finish.',
            ],
          },
          {
            heading: 'The whiteboard',
            points: [
              'In the call, press **Whiteboard**. Draw with the pen, highlighter, shapes or text; choose plain, squared or lined paper, or a chalkboard.',
              'Press **Show to class** to share it - the board says **The class can see the board**. Press **Hide** to stop.',
              'Add pages with **New page**, and save a page as a picture.',
            ],
          },
        ],
        keywords: ['live class', 'online class', 'meeting', 'video call', 'whiteboard', 'class room'],
      },
      {
        id: 'teacher-recordings',
        title: 'Recordings',
        summary: 'Watch your recorded classes back and publish the ones students should see.',
        steps: [
          'In a call, press **Record** to start and **Stop recording** to stop. Classes can also record by themselves.',
          'Open **Recordings** and choose **To review**.',
          'Press **Play** to watch it.',
          'Press **Publish**, check the **Title** and **Subject**, and press **Publish** again. Students find it in their materials.',
        ],
        tips: ['Turn on **Publish my recordings automatically** to skip the review step.', '**Preparing video** means the recording is still being saved.'],
        keywords: ['recording', 'video', 'publish', 'watch back'],
      },
      {
        id: 'teacher-lessons-materials',
        title: 'Lessons and materials',
        summary: 'Log what you taught each day, and share notes, books, worksheets and links - each class has its own.',
        sections: [
          {
            heading: 'Log a lesson',
            steps: [
              'Open **Lessons & Materials** and stay on **Lessons**. Press **Log topic**.',
              'Choose the **Class** and **Subject**, then enter the **Topic** and a **Description**.',
              'Set **Date covered** and **Completion**.',
              'Add **Attach notes**, **Add images**, or **Record a voice note** (press **Stop** when done) if you like.',
              'Press **Log topic**.',
            ],
          },
          {
            heading: 'Share a material',
            steps: [
              'Switch to the **Materials** tab.',
              'Press **Upload** for a file, or **Share link** for a web page or YouTube video.',
              'Choose the class and subject, give it a title, and save it.',
            ],
          },
        ],
        tips: ['Use the class chips at the top to see one class at a time; students only ever see their own class.'],
        keywords: ['topic', 'syllabus', 'lesson', 'notes', 'materials', 'upload', 'voice note', 'library'],
      },
      {
        id: 'teacher-homework',
        title: 'Homework',
        summary: 'Set work, see who has handed in, and mark it.',
        steps: [
          'Open **Homework** and press **Set homework**.',
          'Choose the **Class and subject**, and fill in the **Title**, **What to do** and **Due**. Add **Out of** if it is marked.',
          'Choose whether to **Accept late work**, then press **Set homework**.',
          'Later, press **Marking list**. On a student’s row press **Mark**, enter **Marks** and **Feedback**, and press **Save mark**.',
        ],
        tips: ['Each card shows how many have handed in and how many are outstanding.', '**Reopen** lets a student hand in again.'],
        keywords: ['homework', 'assignment', 'set work', 'mark homework'],
      },
      {
        id: 'teacher-results-gradebook',
        title: 'Gradebook',
        summary: 'Record and review marks for tests taken outside the LMS.',
        steps: [
          'Open **Gradebook** and choose the **Class** and **Subject**.',
          'Press **Record exam**, enter the **Exam name** and what it is **Out of**.',
          'Type each student’s mark (leave a student blank to skip them) and press the **Save … grades** button, which shows how many it will save.',
          'To change a mark, click it, edit it, and press **Save mark** (or **Delete**).',
        ],
        tips: ['Exams set and marked in **Exams** appear here once their results are published.'],
        keywords: ['gradebook', 'marks', 'test', 'grades'],
      },
    ],
  },
  {
    id: 'teacher-assessment',
    title: 'Exams and report cards',
    topics: [
      ...TEACHER_EXAM_TOPICS,
      {
        id: 'teacher-report-cards',
        title: 'Report cards',
        summary: 'Issue term report cards for a class you lead, read them, then release them to students.',
        steps: [
          'Open **Report Cards** and press **Issue report cards**.',
          'Choose the **Class** and enter a **Title**, such as Term 1 Report Card 2026. Set **Exams from** and **Exams until**.',
          'Choose the options (published results only, attendance, rank in the class). Leave **Release to students now** off so you can check first.',
          'Press **Issue cards**.',
          'Open each card, add **Remarks** if you like, and press **Release to student**.',
        ],
        tips: [
          'Only a class’s class teacher can issue its report cards.',
          'A card is a snapshot: marks changed afterwards need the card issued again.',
        ],
        keywords: ['report card', 'term report', 'release', 'rank'],
      },
    ],
  },
  {
    id: 'teacher-time',
    title: 'Your time',
    topics: [
      TEACHER_LEAVE_TOPIC,
      {
        id: 'teacher-extra-classes',
        title: 'Extra classes',
        summary: 'Ask for a class outside the timetable, such as revision before a test.',
        steps: [
          'Open **Extra Classes** and press **Request a class**.',
          'Choose the **Class and subject**, and enter the **Title**, **When** and **Minutes**.',
          'Explain **Why it is needed**, then press **Send request**.',
          'Once an admin approves and creates it, the class appears on the calendar.',
        ],
        tips: ['You can **Withdraw** a request while it is waiting or approved.'],
        keywords: ['extra class', 'revision', 'request'],
      },
      {
        id: 'teacher-insights',
        title: 'Insights',
        summary: 'How your classes are getting on: attendance, marks, and who needs attention.',
        sections: [
          {
            heading: 'What it shows',
            points: [
              'Tiles for **Overall attendance**, **Average grade**, **Students tracked** and **Needing attention**.',
              'Charts of attendance over the last 30 days, marks, attendance by subject and syllabus progress.',
              '**Students needing attention**, with the reasons - search it or export it.',
            ],
          },
        ],
        keywords: ['insights', 'analytics', 'reports', 'needing attention'],
      },
    ],
  },
  {
    id: 'teacher-arena',
    title: 'Arena',
    topics: [
      {
        id: 'teacher-arena',
        title: 'Arena: quiz questions, lab experiments and leaderboards',
        summary: 'Give your classes chapters and questions to battle on, set virtual lab experiments, and see how they do.',
        sections: [
          {
            heading: 'Chapters and questions',
            steps: [
              'Open **Chapters & Questions** and choose a class and subject.',
              'Press **Add chapter** and give it a **Title**.',
              'Open the chapter and press **Add question** (multiple choice or true/false, with a difficulty and an explanation), or **Bulk add** to paste or upload many at once.',
              'When a chapter has enough questions it shows **Ready to battle**. Use **Hide from students** to keep one back.',
            ],
          },
          {
            heading: 'Lab experiments',
            steps: [
              'Open **Lab Experiments**, choose a class, and press **Set an experiment**.',
              'Pick one from the **Library** or **Build your own**, add instructions and a due date, and press **Set for class**.',
              'Each card shows how many students have completed it; press **Results** for the details.',
            ],
          },
          {
            heading: 'Leaderboards',
            points: ['**Arena Leaderboards** ranks your class, or the whole school, by XP and wins - this week or all time.'],
          },
        ],
        keywords: ['arena', 'quiz', 'questions', 'chapters', 'lab', 'experiment', 'leaderboard'],
      },
    ],
  },
  {
    id: 'teacher-help',
    title: 'Everything else',
    topics: [
      {
        id: 'teacher-calendar-notices-help',
        title: 'Calendar, notices and help',
        summary: 'Your whole schedule on one grid, school announcements, and how to get help.',
        sections: [
          { heading: 'Calendar', points: ['Switch between **Month**, **Week** and **Agenda**; press **Today** to come back. Tick what you want to see: lessons, live classes, exams, homework.'] },
          { heading: 'Notices', points: ['**Unread** shows what you have not opened yet. Opening a notice marks it read.'] },
          {
            heading: 'Help & Support',
            steps: [
              'Open **Help & Support** and press **Raise a ticket**.',
              'Give it a subject, choose what it is about and how urgent it is, and describe what is happening.',
              'Press **Raise ticket**. Replies appear in the ticket; answer with **Send reply**.',
            ],
          },
        ],
        keywords: ['calendar', 'notices', 'help', 'support', 'ticket'],
      },
    ],
  },
]
