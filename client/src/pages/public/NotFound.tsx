import { LinkButton } from '@/components/ui/Button';

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-4 text-center">
      <p className="font-display text-7xl font-extrabold text-accent/25">404</p>
      <h1 className="mt-4 font-display text-3xl font-bold text-ink">This page does not exist.</h1>
      <p className="mt-3 text-ink-muted">
        The link may be out of date, or the project may have been unpublished.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <LinkButton to="/">Back to home</LinkButton>
        <LinkButton to="/portfolio" variant="outline">
          Browse the portfolio
        </LinkButton>
      </div>
    </div>
  );
}
