import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Shell } from './app/Shell'
import { Landing } from './features/landing/Landing'
import { Dashboard } from './features/dashboard/Dashboard'
import { Workspace } from './features/workspace/Workspace'
import { Policies } from './features/policies/Policies'
import { Audit } from './features/audit/Audit'
// Not lazy-loaded on purpose: every route must be in the first bundle so the offline app shell can cache it.
import { Lab } from './features/lab/Lab'
import { TrustCenter } from './features/trust/TrustCenter'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/app" element={<Shell />}>
          <Route index element={<Dashboard />} />
          <Route path="workspace" element={<Workspace />} />
          <Route path="lab" element={<Lab />} />
          <Route path="trust" element={<TrustCenter />} />
          <Route path="policies" element={<Policies />} />
          <Route path="audit" element={<Audit />} />
        </Route>
        <Route path="*" element={<Landing />} />
      </Routes>
    </BrowserRouter>
  )
}
