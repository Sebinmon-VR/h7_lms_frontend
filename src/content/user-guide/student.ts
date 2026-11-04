import { GETTING_STARTED } from './common'
import { STUDENT_EXAM_TOPICS } from './student-exams'
import type { GuidePart } from './types'

/** The students' guide. Teachers never see it. */
export const STUDENT_GUIDE: GuidePart[] = [
  GETTING_STARTED,
  {
    id: 'student-day',
    title: 'Your day',
    topics: [
      {
        id: 'student-home',
        title: 'Your home page',
        summary: 'Everything for today in one place: exams, your next class, and how you are doing.',
        sections: [
          {
            heading: 'What you see',
            points: [
              'An exam alert at the very top whenever an exam is open, in progress or coming up this week - with **Start exam**, **Join exam room** or **Continue**.',
              'Your next class, headed **Happening now** or **Coming up next**, with the button to join it.',
              'Four tiles: **Days you were here**, **Your average mark**, your streak, and **Badges earned**. Press **See days** or **See marks** for more.',
              '**Your badges**, **Latest marks**, **New notes**, **How far your class has got** and **Your week** further down.',
            ],
          },
          {
            heading: 'Badges you can earn',
            points: [
              '**On a roll** - 3 days in a row. **Unstoppable** - 10 days in a row.',
              '**Always here** - 90% attendance.',
              '**Star marks** - a 75% average. **Top of the class** - a 90% average.',
              '**Curious mind** - 5 topics covered.',
            ],
          },
        ],
        keywords: ['dashboard', 'home', 'badges', 'streak', 'alert'],
      },
      {
        id: 'student-subjects-timetable',
        title: 'My subjects and timetable',
        summary: 'See what you learn, who teaches it, and when each class happens.',
        steps: [
          '**My Subjects** lists every subject in your class with its teacher.',
          'Open **Timetable**. **Whole week** shows the week at a glance, with what is coming up.',
          'Press **One day** to see a single day; use the arrows to move between days, and **Back to today** to return.',
        ],
        keywords: ['timetable', 'schedule', 'subjects', 'teachers', 'periods'],
      },
      {
        id: 'student-live-classes',
        title: 'Live classes',
        summary: 'Your class has one classroom link for the whole day: join when the first class starts and stay through the breaks.',
        steps: [
          'Open **Live Classes** (or use the button on your **Home** page).',
          'Under **Your classroom**, press **Join the class**. Before the room opens, the button shows **Opens at** and the time.',
          'Allow your camera and microphone, then stay in the room - each teacher comes to you for their period.',
          'Press **Leave the class** after the last period.',
        ],
        sections: [
          {
            heading: 'Watching a class again',
            steps: ['Open **Live Classes** and press **Watch back**.', 'Press **Watch it back** on the class you want. **Recording on its way** means it is still being prepared.'],
          },
        ],
        keywords: ['join class', 'online class', 'video call', 'recording', 'watch back'],
      },
      {
        id: 'student-my-days',
        title: 'My days (attendance)',
        summary: 'How often you have been in class, subject by subject and day by day.',
        steps: [
          'Open **My Days**. The ring shows how many times you were here.',
          'The tiles show **Days you missed**, **Times you were late** and **Excused days**.',
          'In **Your year so far**, each square is one day - tap a coloured one to see what happened.',
          'Under **Recent days**, filter by **Here**, **Away**, **Late** or **Excused**.',
        ],
        keywords: ['attendance', 'absent', 'late', 'present', 'register'],
      },
    ],
  },
  {
    id: 'student-work',
    title: 'Your work',
    topics: [
      {
        id: 'student-lessons-materials',
        title: 'Lessons and materials',
        summary: 'What your class has covered, and the notes, books and videos your teachers shared.',
        steps: [
          'Open **Lessons & Materials**. Use the tabs at the top to switch between **Lessons** and **Materials**.',
          'In more than one class? Choose the class first - each class has its own lessons and materials.',
          '**Lessons** lists what was taught each day, with any notes, pictures or voice notes the teacher added.',
          '**Materials** holds videos, notes and books. Filter by subject, or search by name.',
        ],
        keywords: ['notes', 'books', 'videos', 'library', 'syllabus', 'what we learned', 'materials'],
      },
      {
        id: 'student-homework',
        title: 'Homework',
        summary: 'See the work you have been set and hand it in.',
        steps: [
          'Open **Homework**. Each card shows the subject, who set it and when it is due.',
          'Press **Hand in**, type your answer under **Your work**, and press **Hand in** again.',
          'The card now says **Handed in**. Changed your mind before it is marked? Press **Hand in again**.',
        ],
        tips: ['**Overdue — still accepted** means you can still hand it in late; **Overdue** alone means it is closed.'],
        keywords: ['homework', 'assignment', 'hand in', 'due', 'submit'],
      },
      ...STUDENT_EXAM_TOPICS,
      {
        id: 'student-marks-report-cards',
        title: 'Marks and report cards',
        summary: 'Every test your teachers have marked, and your term report cards.',
        sections: [
          {
            heading: 'My Marks',
            points: [
              'The ring shows your average across every test, with your strongest subject below it.',
              '**How you are doing over time** charts your marks.',
              'Under **Every test**, choose a subject to see only its tests. Your teacher’s comments show as **Teacher said**.',
            ],
          },
          {
            heading: 'Report cards',
            steps: [
              'Open **Report Cards**. The tiles show your **Latest overall**, **Latest grade** and **Class position**.',
              'Tap a term’s card to open it.',
              'Press **Print** to print it or save it as a PDF.',
            ],
          },
        ],
        keywords: ['marks', 'grades', 'results', 'report card', 'print', 'rank'],
      },
    ],
  },
  {
    id: 'student-play',
    title: 'Play',
    topics: [
      {
        id: 'student-arena',
        title: 'Games and Quiz Battle',
        summary: 'Learn by playing: answer quiz questions against a bot, a classmate or a room of friends.',
        sections: [
          {
            heading: 'Starting a battle',
            steps: [
              'Open **Games**, then **Quiz Battle**, and press **Play**.',
              'Tap the mode (for example *Vs bot · Medium · All subjects · 7 rounds*) to change it: **Vs bot**, **Quick match**, **Challenge** (up to 7 friends) or **Private room** (share a code).',
              'Choose the questions (**My class** or **Global**, a subject or chapter) and the number of rounds, then press **Play**.',
              'Answer each question before the timer runs out - tap an answer, or press 1-6 on the keyboard.',
              'At the end, see your points, XP and coins, then press **Rematch** or **Lobby**.',
            ],
          },
          {
            heading: 'Leaderboard, locker and badges',
            points: [
              '**Leaderboard** - your class or the whole school, this week or all time. Win a battle to appear on it.',
              '**Locker & Badges** - spend coins in the **Shop** on avatars, frames, titles and banners (**Buy**, then **Equip**). **Badges** shows what you have earned and what is closest; **My card** is how classmates see you.',
            ],
          },
        ],
        keywords: ['games', 'quiz', 'battle', 'arena', 'leaderboard', 'coins', 'locker', 'badges'],
      },
      {
        id: 'student-lab',
        title: 'Virtual Lab',
        summary: 'Do chemistry experiments safely on screen, step by step or freely.',
        steps: [
          'Open **Games**, then **Virtual Lab**, and choose **Experiments**.',
          'Pick one - experiments **Set by your teacher** are listed first, with their due date.',
          'Follow each step: drag a bottle from **Chemicals** onto a vessel (or tap the bottle, then the vessel). Press **Hint** if you are stuck.',
          'Press **Take the quiz**, answer it, and press **Finish** to see your stars and score.',
          'Use **Free lab** to mix anything you like. **Reset bench** clears it.',
        ],
        keywords: ['lab', 'chemistry', 'experiment', 'science'],
      },
    ],
  },
  {
    id: 'student-fees',
    title: 'Fees',
    topics: [
      {
        id: 'student-fees',
        title: 'Seeing and paying fees',
        summary: 'What is owed, what it is made up of, and how to pay it.',
        steps: [
          'Open **My Fees** to see the breakdown and your **Invoices**.',
          'Press **Pay fees** (or **Pay** beside an invoice).',
          'Choose how much: **Everything outstanding**, one instalment, or **A different amount**.',
          'Choose how to pay: online (UPI, card, net banking or wallet), **Bank transfer**, or **Pay at the office**.',
          'Press the pay button. Online, you are taken to the payment page; offline, you get a **payment reference** to quote with your payment.',
        ],
        tips: ['If online payment is not switched on yet, use a bank transfer or pay at the office.'],
        keywords: ['fees', 'pay', 'invoice', 'payment', 'upi', 'bank transfer'],
      },
    ],
  },
  {
    id: 'student-help',
    title: 'Everything else',
    topics: [
      {
        id: 'student-calendar-notices-help',
        title: 'Calendar, notices and help',
        summary: 'Your whole schedule on one grid, school announcements, and how to get help.',
        sections: [
          { heading: 'Calendar', points: ['Switch between **Month**, **Week** and **Agenda**; press **Today** to come back. Tick the kinds of things you want to see: lessons, live classes, exams, homework.'] },
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
        keywords: ['calendar', 'notices', 'announcements', 'help', 'support', 'ticket', 'contact'],
      },
    ],
  },
]
