import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CheckoutClient } from './checkout-client';

export const metadata: Metadata = {
  title: 'Checkout — monis.rent',
};

/**
 * Server Component. The client child reads the scene from the URL, which needs
 * a Suspense boundary here or the production build fails
 * (missing-suspense-with-csr-bailout). The fallback renders nothing: the
 * itemized list needs the URL, which only the client can read.
 */
export default function CheckoutPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
      <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-ink-soft">
        Step 2 — Reserve
      </p>
      <h1 className="mb-8 mt-1 font-display text-4xl tracking-tight">Checkout</h1>
      <Suspense fallback={null}>
        <CheckoutClient />
      </Suspense>
    </main>
  );
}
