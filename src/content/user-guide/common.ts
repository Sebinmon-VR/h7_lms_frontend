import type { GuidePart } from './types'

/** The first part of both guides: signing in and finding your way around. */
export const GETTING_STARTED: GuidePart = {
  id: 'getting-started',
  title: 'Getting started',
  topics: [
    {
      id: 'signing-in',
      title: 'Signing in',
      summary: 'Use the email address and password the school gave you.',
      steps: [
        'Open the LMS address in Chrome, Edge, Firefox or Safari.',
        'Enter your email and password, then press **Sign in**.',
        'Forgot your password? Type your email and press **Forgot password?**. A reset link arrives by email; open it and choose a new password.',
      ],
      tips: [
        'To change your password once you are in, press your initials at the top right, then **Profile & settings**.',
        'Signing in on a shared computer? Press your initials, then **Sign out** when you finish.',
      ],
      keywords: ['login', 'log in', 'password', 'reset', 'forgot'],
    },
    {
      id: 'finding-your-way',
      title: 'Finding your way around',
      summary: 'The menu on the left holds every section; the top bar searches and changes the look.',
      sections: [
        {
          heading: 'The parts of the screen',
          points: [
            '**Left menu** - every section you can use, in groups. On a phone, open it with the menu button at the top left.',
            '**Search** (or press **Ctrl K**) - type a few letters to jump to any page.',
            '**Theme button** - switch between light, dark or your device’s setting.',
            '**Your initials** (top right) - **Profile & settings** and **Sign out**.',
            '**Guide** at the bottom of the menu - this guide, whenever you need it.',
          ],
        },
        {
          heading: 'For everyone, under General',
          points: [
            '**Calendar** - lessons, live classes, exams and homework on one grid.',
            '**Notices** - announcements addressed to you.',
            '**Help & Support** - raise a ticket, or find who to call.',
          ],
        },
      ],
      tips: ['Live classes, exams and marking are easiest on a computer with a camera, though the LMS works on a phone too.'],
      keywords: ['menu', 'sidebar', 'search', 'dark mode', 'theme', 'profile', 'calendar', 'notices', 'support'],
    },
  ],
}
