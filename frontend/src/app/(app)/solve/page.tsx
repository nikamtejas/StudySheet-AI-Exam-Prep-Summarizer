import type { Metadata } from 'next';
import { SolveForm } from '@/components/solve/SolveForm';
import { AppNav } from '@/components/nav/AppNav';

export const metadata: Metadata = {
  title: 'Solve — StudySheet',
};

export default async function SolvePage() {
  return (
    <main className="bg-ink text-paper min-h-screen">
      <AppNav />
      <SolveForm />
    </main>
  );
}
