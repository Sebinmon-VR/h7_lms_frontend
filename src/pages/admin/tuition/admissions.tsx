import { AdmissionsBoard } from '@/pages/admin/admissions'

/**
 * Tuition session years and admission categories.
 *
 * The school's admissions screen, pointed at the tuition board. Records
 * created here are tuition records without the form saying so, only tuition
 * records are listed, and making a year current rolls over the tuition
 * calendar alone — the school's current year is untouched.
 */
export default function AdminTuitionAdmissionsPage() {
  return <AdmissionsBoard board="TUITION" />
}
