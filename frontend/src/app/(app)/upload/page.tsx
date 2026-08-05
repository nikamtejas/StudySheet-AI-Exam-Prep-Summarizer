import type { Metadata } from 'next';
import { UploadForm } from '@/components/upload/UploadForm';
import { AppNav } from '@/components/nav/AppNav';

export const metadata: Metadata = {
  title: 'Upload — StudySheet',
};

export default async function UploadPage() {
  return (
    <main className="bg-ink text-paper min-h-screen">
      <AppNav />
      <UploadForm />
    </main>
  );
}
