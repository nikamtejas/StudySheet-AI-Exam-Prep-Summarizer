import type { Metadata } from 'next';
import { UploadForm } from '@/components/upload/UploadForm';

export const metadata: Metadata = {
  title: 'Upload — StudySheet',
};

export default function UploadPage() {
  return (
    <main className="bg-ink text-paper min-h-screen">
      <UploadForm />
    </main>
  );
}
