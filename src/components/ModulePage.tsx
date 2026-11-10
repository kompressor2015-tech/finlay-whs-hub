import { moduleById } from '../utils/modules.ts';
import { canOpenModule, type WhsAccess } from '../utils/access.ts';
import { hrefFor } from '../hooks/useRoute.ts';

/** Placeholder for a module that has not been built yet. */
export function ModulePage({ id, access }: { id: string; access: WhsAccess }) {
  const mod = moduleById(id);
  if (!mod) {
    return (
      <div className="bg-white border border-line rounded-xl p-6">
        <h1 className="m-0 text-xl font-bold">Page not found</h1>
        <p className="mt-2 mb-0 text-muted text-sm">
          <a href={hrefFor({ name: 'home' })} className="text-finlay">Back to home</a>
        </p>
      </div>
    );
  }
  const allowed = canOpenModule(access, mod.id);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="m-0 text-2xl font-bold">{mod.label}</h1>
        <p className="mt-1.5 mb-0 text-muted text-[15px]">{mod.about}</p>
      </div>
      <div className="bg-white border border-line rounded-xl p-6">
        {allowed ? (
          <>
            <h2 className="m-0 text-base font-semibold">Coming in step {mod.step}</h2>
            <p className="mt-2 mb-0 text-sm text-muted leading-relaxed">
              This module is next on the build list. It will be mocked up for you to approve before it is built.
            </p>
          </>
        ) : (
          <>
            <h2 className="m-0 text-base font-semibold">Office only</h2>
            <p className="mt-2 mb-0 text-sm text-muted leading-relaxed">
              Ask your supervisor or the WHS officer if you need something from {mod.label.toLowerCase()}.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
