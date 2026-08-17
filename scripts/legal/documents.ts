/**
 * The privacy policy and terms of use, as data rather than prose in a screen.
 *
 * Held in the bundle, not fetched: a user must be able to read what they are
 * accepting before they have signed in, on a phone with no connection, and a
 * policy that fails to load is a policy nobody agreed to. It also means the
 * text ships and versions with the build that behaves the way it describes.
 *
 * PLACEHOLDERS — every value in `LEGAL_ENTITY` marked `TODO` must be filled in
 * before release. They are collected here rather than scattered through the
 * text so one grep for "TODO" finds all of them.
 */

export const LEGAL_ENTITY = {
  /** Registered name of the software provider. */
  processor: 'Hamdaz Technologies LLC',
  /** Registered office, used for statutory notices. */
  processorAddress:
    'Hamdaz Technologies LLC, Easthill, Karaparamba, Kozhikode, Kerala, India',
  /** The mailbox that receives privacy and deletion requests. */
  privacyEmail: 'support@hamdaz.com',
  /** India DPDP s.13 requires a reachable contact for grievances. */
  grievanceOfficer:
    'The Grievance Officer, Hamdaz Technologies LLC, Easthill, Karaparamba, Kozhikode, Kerala, India',
  /** Courts with jurisdiction for the India-governed contract. */
  indiaVenue: 'Kozhikode, Kerala, India',
  /** Courts with jurisdiction for the UAE deployment. */
  uaeVenue: 'Abu Dhabi, United Arab Emirates',
  supportEmail: 'hello@hamdaz.com',
} as const

/**
 * Any `LEGAL_ENTITY` value still carrying a bracketed placeholder or left blank.
 *
 * `scripts/render-legal.mjs` refuses to write the hosted copies while this is
 * non-empty, so an unfilled value cannot reach the public URL a store reviewer
 * reads. Cheap insurance against the one class of mistake that is invisible in
 * the editor and obvious to a reviewer.
 */
export function unfilledPlaceholders(): string[] {
  return Object.entries(LEGAL_ENTITY)
    .filter(([, value]) => value.includes('[') || value.trim() === '')
    .map(([key]) => key)
}

/**
 * Bumping this re-prompts every user on their next launch.
 *
 * It covers BOTH documents deliberately: a user accepts the pair, and tracking
 * them separately would let someone sit on an old privacy policy while having
 * accepted current terms. Use a date so "which text did they agree to?" is
 * answerable from the value alone.
 */
export const LEGAL_VERSION = '2026-08-17'

/** Shown as the effective date at the top of each document. */
export const LEGAL_EFFECTIVE_DATE = '17 August 2026'

export type LegalBlock =
  | { type: 'p'; text: string }
  | { type: 'ul'; items: string[] }

export interface LegalSection {
  heading: string
  blocks: LegalBlock[]
}

export interface LegalDocument {
  id: 'privacy' | 'terms'
  title: string
  /** One line under the title, before the first heading. */
  summary: string
  sections: LegalSection[]
}

const p = (text: string): LegalBlock => ({ type: 'p', text })
const ul = (items: string[]): LegalBlock => ({ type: 'ul', items })

/**
 * Deletion, written once and used twice.
 *
 * It is a section of the privacy policy AND the whole of the standalone page
 * Play asks for as a "data deletion URL". Duplicating it would guarantee the
 * two drift, and of all the text here this is the pair a reviewer is most
 * likely to read side by side.
 */
export const DELETION_SECTION: LegalSection = {
  heading: 'Deleting your account and your data',
  blocks: [
    p(
      'Because accounts here are issued by a school and hold academic records the school must keep, the app does not let you delete your own account — doing so would erase attendance and marks the school is required to retain.',
    ),
    p('To have your account or your data deleted:'),
    ul([
      'Ask your school. A school administrator can deactivate an account, which immediately prevents sign-in, or delete it permanently along with the records attached to it.',
      `Or write to us at ${LEGAL_ENTITY.privacyEmail} with your name, your school and what you want removed. We will acknowledge your request and forward it to your school, which decides it, and we will action their instruction.`,
      'In the app, the same route is at More → Legal → Delete your data, which opens a pre-addressed message with your account details filled in.',
    ]),
    p(
      'We will respond to a request within 30 days. Where the school must keep a record by law, we will tell you which records are being retained and why. Deactivating an account keeps its academic history so past records stay accurate; permanent deletion removes the profile and the records that reference it, and cannot be undone.',
    ),
  ],
}

// --------------------------------------------------------- privacy policy

export const PRIVACY_POLICY: LegalDocument = {
  id: 'privacy',
  title: 'Privacy Policy',
  summary:
    'How H7 EdTech handles the personal data of students, guardians and staff, and who is responsible for it.',
  sections: [
    {
      heading: 'Who is responsible for your data',
      blocks: [
        p(
          'H7 EdTech is a school management application supplied to your school by ' +
            `${LEGAL_ENTITY.processor} ("we", "us").`,
        ),
        p(
          'Your school is the data controller (in India, the Data Fiduciary). The school decides what personal data is collected, why, and how long it is kept. We act only as a data processor: we operate the software and process data on the school\'s documented instructions, and we do not use it for our own purposes.',
        ),
        p(
          'This means requests about your data should go to your school first. We will support the school in answering them, but we are not permitted to disclose or change a school\'s records on our own initiative.',
        ),
      ],
    },
    {
      heading: 'How accounts are created',
      blocks: [
        p(
          'You cannot create an account in this app. There is no sign-up form. Accounts are created by a school administrator at the time of admission or employment, and the password is generated by the server and sent to the address the school recorded.',
        ),
        p(
          'For students, the personal data in the app is the data the parent or guardian provided to the school during admission. The school is responsible for obtaining and holding the consent that permits it to be processed.',
        ),
      ],
    },
    {
      heading: 'What data the app holds',
      blocks: [
        p('Depending on your role, the app may hold:'),
        ul([
          'Identity and contact details: full name, email address, phone and alternate phone, date of birth, gender, and a profile photograph.',
          'Postal address: address lines, city, state, postal code and country.',
          'Student records: admission number, roll number, admission date, blood group, and the class the student is enrolled in.',
          'Guardian details: guardian name, phone, email and relationship to the student.',
          'Staff records: employee ID, designation, qualification, specialisation, date of joining and years of experience.',
          'Academic records: attendance, examination marks, syllabus topics covered, timetable periods, subject assignments and class-teacher assignments.',
          'Content: study materials uploaded by teachers, and links to scheduled live classes.',
          'Administrative notes recorded by the school about a user. These are internal to the school and are never shown to the person they describe.',
        ]),
        p(
          'We do not collect location data, contacts, advertising identifiers or biometric data. The app contains no advertising or analytics tracking software, and we do not sell personal data or use it to build profiles.',
        ),
      ],
    },
    {
      heading: 'What is stored on your device',
      blocks: [
        p('The app keeps a small amount of data in its own private storage:'),
        ul([
          'Your sign-in token, so you are not asked to sign in on every launch.',
          'Your theme preference and your class-reminder preference.',
          'A marker of when you last opened your notifications, so "new" means new to you.',
          'A record that you accepted this policy and the terms, with the version and date.',
          'A notification token, if you enable class reminders, so reminders can reach this device.',
        ]),
        p(
          'This storage is private to the app. Signing out clears your token and session; uninstalling the app removes all of it.',
        ),
      ],
    },
    {
      heading: 'Why the data is processed',
      blocks: [
        ul([
          'To authenticate you and show only what your role permits.',
          'To record and display attendance, marks, syllabus progress and timetables.',
          'To distribute study materials and to schedule and join live classes.',
          'To send reminders about upcoming classes, if you have enabled them.',
          'To email account credentials when the school issues or resets them.',
          'To keep the service secure and to diagnose faults.',
        ]),
      ],
    },
    {
      heading: 'Who else processes the data',
      blocks: [
        p(
          'We use the following providers to run the service. They process data on our behalf under contract and may not use it for their own purposes:',
        ),
        ul([
          'Google Firebase Authentication — verifies sign-in and issues session tokens.',
          'Google Cloud Firestore — stores the school\'s records.',
          'Google Cloud Storage — stores uploaded study materials.',
          'Google Calendar and Google Meet — create and host live classes, where the school has enabled it.',
          'Microsoft Azure — hosts the application server, in the India South Central region.',
          'Expo — delivers app updates and, if reminders are enabled, push notifications.',
          'An email provider — delivers credentials and reminder emails.',
        ]),
        p(
          'Some of these providers operate infrastructure outside your country. Where personal data is transferred across a border, it is done under the provider\'s contractual safeguards and only to the extent needed to run the service.',
        ),
      ],
    },
    {
      heading: 'Who can see your data inside the app',
      blocks: [
        ul([
          'Students see only their own attendance, marks, materials, timetable and classes.',
          'Teachers see the classes and subjects they are assigned to, and the records they create.',
          'A class teacher additionally sees, and may correct, everything recorded against the class they lead — including records entered by other teachers.',
          'School administrators see all records for their school.',
        ]),
        p(
          'Guardian contact details are visible to school staff so the school can reach a student\'s family.',
        ),
      ],
    },
    {
      heading: 'How long data is kept',
      blocks: [
        p(
          'Retention is decided by your school, which holds academic records under its own obligations. We keep data for as long as the school\'s agreement with us is in force, and delete or return it when the agreement ends, unless the school or the law requires us to keep it longer.',
        ),
        p(
          'When an account is deactivated, the person can no longer sign in but their academic history is preserved so past records remain accurate. Permanent deletion is a separate action available to the school.',
        ),
      ],
    },
    {
      heading: 'Children\'s data',
      blocks: [
        p(
          'The app is used by school students, including children. Children do not create accounts and cannot register themselves. A child\'s personal data reaches the app because a parent or guardian provided it to the school at admission.',
        ),
        p(
          'Under India\'s Digital Personal Data Protection Act 2023, anyone under 18 is a child, and their data may only be processed with verifiable parental consent. The school, as Data Fiduciary, is responsible for obtaining and holding that consent. We do not use children\'s data for advertising, tracking or behavioural monitoring, and the app shows no advertisements.',
        ),
      ],
    },
    DELETION_SECTION,
    {
      heading: 'Your rights',
      blocks: [
        p(
          'Depending on where you are, you have the right to access your personal data, to have inaccurate data corrected, to have data erased, to withdraw consent, and to complain to a regulator.',
        ),
        p(
          `In India, these rights arise under the Digital Personal Data Protection Act 2023. You may raise a grievance by writing to ${LEGAL_ENTITY.privacyEmail}, or by post to ${LEGAL_ENTITY.grievanceOfficer}. If it is not resolved, you may complain to the Data Protection Board of India.`,
        ),
        p(
          'In the United Arab Emirates, these rights arise under Federal Decree-Law No. 45 of 2021 on the Protection of Personal Data, and include the rights to access, correction, erasure, restriction of processing, data portability and objection.',
        ),
        p(
          'Because your school controls the records, please make your request to the school first. If you contact us directly we will pass the request to the school and assist them in answering it.',
        ),
      ],
    },
    {
      heading: 'Security',
      blocks: [
        p(
          'Sign-in is handled by Google Firebase Authentication; the app never stores your password. Traffic between the app and the server is encrypted in transit. Access inside the app is enforced by role on the server, not merely hidden in the interface.',
        ),
        p(
          'No system is perfectly secure. If a breach affects your data, we will notify your school without undue delay so the school can meet its own notification duties.',
        ),
      ],
    },
    {
      heading: 'Changes to this policy',
      blocks: [
        p(
          'If this policy changes materially, the app will ask you to read and accept the updated version the next time you open it. The effective date at the top of this document tells you which version you are reading.',
        ),
      ],
    },
    {
      heading: 'Contact',
      blocks: [
        p(
          `Privacy questions: ${LEGAL_ENTITY.privacyEmail}. Postal address: ${LEGAL_ENTITY.processorAddress}. For anything about your own records, contact your school.`,
        ),
      ],
    },
  ],
}

// ------------------------------------------------------------ terms of use

export const TERMS_OF_USE: LegalDocument = {
  id: 'terms',
  title: 'Terms of Use',
  summary: 'The rules for using H7 EdTech, and what you can expect from it.',
  sections: [
    {
      heading: 'Agreement',
      blocks: [
        p(
          `These terms are between you and ${LEGAL_ENTITY.processor}, which supplies the H7 EdTech application to your school. By accepting them and using the app, you agree to them. If you do not accept them, do not use the app.`,
        ),
        p(
          'Your school\'s own policies also apply to your use of the app. Where the school\'s policy is stricter, the school\'s policy governs.',
        ),
      ],
    },
    {
      heading: 'Who may use the app',
      blocks: [
        p(
          'The app is for students, guardians and staff of a school that licenses it. Accounts are issued by a school administrator. You may not create an account yourself, and there is no public sign-up.',
        ),
        p(
          'Where the account holder is a child, the parent or guardian who enrolled them accepts these terms on their behalf and is responsible for their use of the app.',
        ),
      ],
    },
    {
      heading: 'Your account',
      blocks: [
        ul([
          'Your credentials are personal to you. Do not share them, and do not use anyone else\'s.',
          'Tell your school immediately if you think someone else has access to your account.',
          'You are responsible for what is done through your account.',
          'Your school may suspend, deactivate or delete your account at its discretion — for example when a student leaves or a member of staff departs.',
        ]),
      ],
    },
    {
      heading: 'Acceptable use',
      blocks: [
        p('You must not:'),
        ul([
          'Attempt to reach records your role does not entitle you to, or work around the app\'s access controls.',
          'Copy, publish or pass on another person\'s personal data — including classmates\' marks, attendance or contact details — outside the school.',
          'Upload material that is unlawful, defamatory, obscene, or that infringes someone else\'s copyright.',
          'Upload malware, or attempt to disrupt, overload, probe or reverse-engineer the service.',
          'Use automated means to extract data from the app.',
          'Record, re-transmit or publish a live class without the permission of the school and the participants.',
        ]),
        p(
          'Teachers are responsible for the material they upload and for having the right to share it with their class.',
        ),
      ],
    },
    {
      heading: 'Records and accuracy',
      blocks: [
        p(
          'Attendance, marks and syllabus entries are recorded by school staff. A class teacher may correct records for the class they lead, including entries made by other teachers. If you believe a record about you is wrong, raise it with your school — we cannot alter a school\'s records ourselves.',
        ),
      ],
    },
    {
      heading: 'Ownership',
      blocks: [
        p(
          'The school\'s data — its records, uploaded materials and academic content — belongs to the school and the people it describes. It does not belong to us.',
        ),
        p(
          `The application itself, including its software, design and branding, belongs to ${LEGAL_ENTITY.processor}. You are granted a personal, non-transferable, revocable right to use it for as long as your school licenses it and your account is active. You may not copy, sell, sublicense or create derivative works from it.`,
        ),
      ],
    },
    {
      heading: 'Availability and updates',
      blocks: [
        p(
          'We aim to keep the service available but do not guarantee uninterrupted access. Maintenance, faults, or failures at the providers listed in the Privacy Policy may interrupt it.',
        ),
        p(
          'The app updates itself over the air. Continuing to use it after an update means you accept the updated version. We may change or withdraw features.',
        ),
      ],
    },
    {
      heading: 'Live classes and third-party services',
      blocks: [
        p(
          'Live classes may run on Google Meet, and files may be stored in Google Cloud Storage. Those services have their own terms, which apply to you when you use them through the app.',
        ),
      ],
    },
    {
      heading: 'Disclaimer and liability',
      blocks: [
        p(
          'The app is provided on an "as is" basis. To the extent the law permits, we exclude implied warranties, including fitness for a particular purpose.',
        ),
        p(
          'We are not liable for indirect or consequential loss, or for loss of data caused by circumstances outside our reasonable control. Nothing in these terms limits liability that cannot lawfully be limited, including liability for death or personal injury caused by negligence, or for fraud.',
        ),
        p(
          'Our relationship on data protection is with your school. Claims about how a school records, uses or discloses your data should be directed to the school.',
        ),
      ],
    },
    {
      heading: 'Suspension',
      blocks: [
        p(
          'We may suspend access where it is necessary to protect the service, other users, or personal data — for example in response to a security incident or a breach of these terms.',
        ),
      ],
    },
    {
      heading: 'Governing law',
      blocks: [
        p(
          `Where the school is established in India, these terms are governed by the laws of India, and the courts of ${LEGAL_ENTITY.indiaVenue} have exclusive jurisdiction.`,
        ),
        p(
          `Where the school is established in the United Arab Emirates, these terms are governed by the laws of the United Arab Emirates, and the courts of ${LEGAL_ENTITY.uaeVenue} have exclusive jurisdiction.`,
        ),
      ],
    },
    {
      heading: 'Changes to these terms',
      blocks: [
        p(
          'We may update these terms. When we make a material change, the app will ask you to accept the new version before you continue using it.',
        ),
      ],
    },
    {
      heading: 'Contact',
      blocks: [
        p(
          `Questions about these terms: ${LEGAL_ENTITY.supportEmail}. Questions about your records or your account: your school.`,
        ),
      ],
    },
  ],
}

export const LEGAL_DOCUMENTS: Record<LegalDocument['id'], LegalDocument> = {
  privacy: PRIVACY_POLICY,
  terms: TERMS_OF_USE,
}

/**
 * The pages published to the web so the app stores have URLs to point at.
 *
 * A superset of `LEGAL_DOCUMENTS`: Play wants a dedicated data-deletion URL,
 * which in the app is a screen rather than a document. `scripts/render-legal.mjs`
 * renders these to static HTML — the app itself never reads this list.
 */
export const HOSTED_PAGES: { slug: string; title: string; summary: string; sections: LegalSection[] }[] = [
  {
    slug: 'privacy',
    title: PRIVACY_POLICY.title,
    summary: PRIVACY_POLICY.summary,
    sections: PRIVACY_POLICY.sections,
  },
  {
    slug: 'terms',
    title: TERMS_OF_USE.title,
    summary: TERMS_OF_USE.summary,
    sections: TERMS_OF_USE.sections,
  },
  {
    slug: 'data-deletion',
    title: 'Data Deletion Request',
    summary:
      'How a student, guardian or member of staff can have their H7 EdTech account and personal data deleted.',
    sections: [
      DELETION_SECTION,
      {
        heading: 'Who to contact',
        blocks: [
          p(
            `Requests: ${LEGAL_ENTITY.privacyEmail}. Postal: ${LEGAL_ENTITY.processorAddress}. Your school remains the controller of its records, so a request made to the school directly is usually the fastest route.`,
          ),
        ],
      },
    ],
  },
]
