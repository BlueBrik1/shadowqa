import { HashRouter, Routes, Route } from "react-router-dom";
import { Welcome } from "./pages/Welcome";
import { SoloConnect } from "./pages/SoloConnect";
import { SoloProject } from "./pages/SoloProject";
import { TeamConnect } from "./pages/TeamConnect";
import { Dashboard } from "./pages/Dashboard";
import { SoloContext } from "./pages/SoloContext";
import { Plans } from "./pages/Plans";
import { PlanReview } from "./pages/PlanReview";
import { Jobs } from "./pages/Jobs";
import { JobDetail } from "./pages/JobDetail";
import { Findings } from "./pages/Findings";
import { Live, LiveIncident } from "./pages/Live";
import { TeamDashboard } from "./pages/team/TeamDashboard";
import { TeamPlans } from "./pages/team/TeamPlans";
import { TeamPlanReview } from "./pages/team/TeamPlanReview";
import { TeamJobs } from "./pages/team/TeamJobs";
import { TeamJobDetail } from "./pages/team/TeamJobDetail";
import { TeamFindings } from "./pages/team/TeamFindings";
import { TeamAdmin } from "./pages/team/TeamAdmin";

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Welcome />} />
        <Route path="/connect/solo" element={<SoloConnect />} />
        <Route path="/connect/team" element={<TeamConnect />} />
        <Route path="/solo/project" element={<SoloProject />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/context" element={<SoloContext />} />
        <Route path="/plans" element={<Plans />} />
        <Route path="/plans/:id" element={<PlanReview />} />
        <Route path="/jobs" element={<Jobs />} />
        <Route path="/jobs/:id" element={<JobDetail />} />
        <Route path="/findings" element={<Findings />} />
        <Route path="/live" element={<Live />} />
        <Route path="/live/:id" element={<LiveIncident />} />
        <Route path="/team/dashboard" element={<TeamDashboard />} />
        <Route path="/team/plans" element={<TeamPlans />} />
        <Route path="/team/plans/:id" element={<TeamPlanReview />} />
        <Route path="/team/jobs" element={<TeamJobs />} />
        <Route path="/team/jobs/:id" element={<TeamJobDetail />} />
        <Route path="/team/findings" element={<TeamFindings />} />
        <Route path="/team/admin" element={<TeamAdmin />} />
      </Routes>
    </HashRouter>
  );
}
