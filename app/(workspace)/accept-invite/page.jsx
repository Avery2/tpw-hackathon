import { notFound } from 'next/navigation';
import SignIn from '../sign-in/sign-in.jsx';

export default async function Page({ searchParams }) {
  const { id } = await searchParams;
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id)) notFound();
  return <SignIn id={id} />;
}
