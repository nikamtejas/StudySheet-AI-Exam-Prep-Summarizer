import type { Metadata } from 'next';
import { SolveForm } from '@/components/solve/SolveForm';

export const metadata: Metadata = {
  title: 'Solve — StudySheet',
};

export default function SolvePage() {
  return (
    <main className="bg-ink text-paper min-h-screen">
      <SolveForm />
    </main>
  );
}
