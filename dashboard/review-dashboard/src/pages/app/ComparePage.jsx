import { useNavigate } from 'react-router-dom';
import { ComparePage as CompareExperience } from '../../App.jsx';
import { useAppShell } from '../../context/AppShellContext.jsx';

export default function ComparePage() {
  const navigate = useNavigate();
  const { compareFocus, report, setReport } = useAppShell();

  function handleOpenSingleRun(run) {
    setReport(run);
    navigate(`/app/runs/${run.report_id}`);
  }

  return <CompareExperience focusReport={compareFocus || report} onOpenSingleRun={handleOpenSingleRun} />;
}
