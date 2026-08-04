import { Hero } from '@/components/landing/Hero';
import { HowItWorks } from '@/components/landing/HowItWorks';

export default function Home() {
  return (
    <main className="bg-ink text-paper min-h-screen">
      <Hero />
      <HowItWorks />
    </main>
  );
}
