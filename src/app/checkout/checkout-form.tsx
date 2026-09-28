'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';

/**
 * Reserve form: name + contact, client-side validation, simulated submission.
 * Zero network calls anywhere (FRD:63, D4) — the 800 ms wait is a timer, the
 * confirmation is local state, and the field values are cleared once the
 * confirmation shows so nothing lingers.
 */

/** An email address, or a phone number with at least one digit. */
const EMAIL = /^\S+@\S+\.\S+$/;
const PHONE = /^\+?\d[\d\s-]{6,}$/;

interface FieldErrors {
  name?: string;
  contact?: string;
}

export function CheckoutForm() {
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [reserved, setReserved] = useState(false);

  if (reserved) {
    return (
      <div
        role="status"
        className="rounded-lg border border-emerald-200 bg-emerald-50 p-8 text-center"
      >
        <p className="font-display text-2xl">Your setup is reserved</p>
        <p className="mt-1 text-sm text-ink-soft">We will hold this setup for you.</p>
        <Link
          href="/"
          className="mt-3 inline-block text-sm text-ink-soft underline underline-offset-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-ink"
        >
          Back to the builder
        </Link>
      </div>
    );
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    const next: FieldErrors = {};
    if (name.trim() === '') next.name = 'Enter your name.';
    const contactValue = contact.trim();
    if (contactValue === '') next.contact = 'Enter an email address or phone number.';
    else if (!EMAIL.test(contactValue) && !PHONE.test(contactValue)) {
      next.contact = 'Enter a valid email address or phone number.';
    }
    setErrors(next);
    if (next.name || next.contact) {
      // Design follow-up (Slice 10 nit): a failed submit moves focus to the
      // first invalid field so keyboard and screen-reader users land on it.
      const firstInvalid = next.name ? 'checkout-name' : 'checkout-contact';
      document.getElementById(firstInvalid)?.focus();
      return;
    }
    setSubmitting(true);
    // Simulated submission: a timer, never a request (FRD:63, D4).
    window.setTimeout(() => {
      setSubmitting(false);
      setReserved(true);
      setName('');
      setContact('');
    }, 800);
  };

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="space-y-4 rounded-lg border border-line bg-white p-4"
    >
      <div>
        <label htmlFor="checkout-name" className="block text-sm font-medium">
          Name
        </label>
        <input
          id="checkout-name"
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? 'checkout-name-error' : undefined}
          className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm transition-colors duration-150 focus:border-ink focus-visible:outline-2 focus-visible:outline-ink"
        />
        {errors.name && (
          <p id="checkout-name-error" role="alert" className="mt-1 text-sm text-red-600">
            {errors.name}
          </p>
        )}
      </div>
      <div>
        <label htmlFor="checkout-contact" className="block text-sm font-medium">
          Email or phone
        </label>
        <input
          id="checkout-contact"
          // type="text" is the recorded decision (design follow-up, Slice 10
          // nit): the field accepts a phone number too, so type="email" would
          // mislabel half its valid inputs.
          type="text"
          value={contact}
          onChange={(event) => setContact(event.target.value)}
          aria-invalid={errors.contact ? true : undefined}
          aria-describedby={errors.contact ? 'checkout-contact-error' : undefined}
          className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm transition-colors duration-150 focus:border-ink focus-visible:outline-2 focus-visible:outline-ink"
        />
        {errors.contact && (
          <p id="checkout-contact-error" role="alert" className="mt-1 text-sm text-red-600">
            {errors.contact}
          </p>
        )}
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-full bg-accent-deep px-4 py-2 text-sm font-semibold text-white transition-colors duration-150 hover:bg-ink disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-ink"
      >
        {submitting ? 'Reserving…' : 'Reserve setup'}
      </button>
    </form>
  );
}
