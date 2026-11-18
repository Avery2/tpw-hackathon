import { connection } from 'next/server';
import SignIn from './sign-in.jsx';

export default async function Page() {
  await connection();
  return <SignIn />;
}
