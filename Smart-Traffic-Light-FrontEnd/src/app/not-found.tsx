import { redirect } from 'next/navigation';

// Unknown routes go to the dashboard, as before.
export default function NotFound() {
  redirect('/');
}
