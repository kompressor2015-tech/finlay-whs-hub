import type { ReactElement } from 'react';
import type { WhsUser } from '../services/auth.ts';
import type { Route } from '../hooks/useRoute.ts';
import { canOpenModule } from '../utils/access.ts';
import { ActionsPage } from './ActionsPage.tsx';
import { HazardForm } from './HazardForm.tsx';
import { HazardPage } from './HazardPage.tsx';
import { IncidentForm } from './IncidentForm.tsx';
import { IncidentPage } from './IncidentPage.tsx';
import { ModulePage } from './ModulePage.tsx';
import { RegisterPage } from './RegisterPage.tsx';
import { PrestartForm, SiteInspectionForm, Take5Form } from './CheckForms.tsx';
import { CheckPage } from './CheckPage.tsx';
import { ChecklistEditor } from './ChecklistEditor.tsx';
import { InspectionsPage } from './InspectionsPage.tsx';
import { PlantPage } from './PlantPage.tsx';
import { ChemicalsPage } from './ChemicalsPage.tsx';
import { ChemicalPage } from './ChemicalPage.tsx';
import { ChemTool } from './ChemTools.tsx';

/** Picks the screen for the current address. Home is drawn by the desktop or phone layout. */
export function Screen({ route, user, home }: { route: Route; user: WhsUser; home: () => ReactElement }) {
  if (route.name === 'incident') return route.id === 'new' ? <IncidentForm user={user} /> : <IncidentPage id={route.id} user={user} />;
  if (route.name === 'hazard') return route.id === 'new' ? <HazardForm user={user} /> : <HazardPage id={route.id} user={user} />;
  if (route.name === 'check') {
    if (route.id === 'new-prestart') return <PrestartForm user={user} />;
    if (route.id === 'new-take5') return <Take5Form user={user} />;
    if (route.id.startsWith('new-site-')) return <SiteInspectionForm key={route.id} checklistId={route.id.slice('new-site-'.length)} user={user} />;
    return <CheckPage key={route.id} id={route.id} user={user} />;
  }
  if (route.name === 'checklist') return <ChecklistEditor key={route.id} id={route.id} user={user} />;
  if (route.name === 'chemical') return <ChemicalPage key={route.id} id={route.id} user={user} />;
  if (route.name === 'chem') return <ChemTool key={route.id} tool={route.id} user={user} />;
  if (route.name === 'module' && canOpenModule(user.access, route.id)) {
    if (route.id === 'inspections') return <InspectionsPage user={user} />;
    if (route.id === 'plant') return <PlantPage user={user} />;
    if (route.id === 'chemicals') return <ChemicalsPage user={user} />;
    if (route.id === 'incidents' || route.id === 'hazards') return <RegisterPage key={route.id} tab={route.id} user={user} />;
    if (route.id === 'actions') return <ActionsPage user={user} />;
  }
  if (route.name === 'module') return <ModulePage id={route.id} access={user.access} />;
  return home();
}
