/** "Reminder sent" ticks for company-wide courses. */

import { supabase } from './supabase.ts';
import type { CourseReminder } from '../utils/companyCourses.ts';

type Result<T> = { data?: T; error?: string };

function friendly(message: string | undefined): string {
  if (!message) return 'Something went wrong. Please try again.';
  if (/row-level security|permission denied/i.test(message)) return 'You do not have permission to do that.';
  if (/whs_course_reminders/i.test(message) && /does not exist|schema cache/i.test(message)) return 'Reminder ticks are not set up yet. Run whs_039_course_reminders.sql in Supabase.';
  return message;
}

export async function listCourseReminders(): Promise<Result<CourseReminder[]>> {
  const { data, error } = await supabase.from('whs_course_reminders').select('*').limit(5000);
  return error ? { error: friendly(error.message) } : { data: (data ?? []) as CourseReminder[] };
}

export async function setCourseReminder(personId: string, course: string): Promise<Result<CourseReminder>> {
  const { data, error } = await supabase.from('whs_course_reminders').insert({ person_id: personId, course }).select('*').single();
  return error ? { error: friendly(error.message) } : { data: data as CourseReminder };
}

export async function clearCourseReminder(id: string): Promise<Result<true>> {
  const { error } = await supabase.from('whs_course_reminders').delete().eq('id', id);
  return error ? { error: friendly(error.message) } : { data: true };
}
