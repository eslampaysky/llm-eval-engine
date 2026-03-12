import { useNavigate } from 'react-router-dom';
import { BreakPage as BreakExperience } from '../../App.jsx';
import { useAppShell } from '../../context/AppShellContext.jsx';

export default function PlaygroundPage() {
  const navigate = useNavigate();
  const { groqApiKey, setGroqApiKey, setReport, setCompareFocus } = useAppShell();

  function handleReportReady(report) {
    setReport(report);
    setCompareFocus(report);
    navigate('/app/compare');
  }

  return (
    <BreakExperience
      onReportReady={handleReportReady}
      initialGroqApiKey={groqApiKey}
      onGroqApiKeyChange={setGroqApiKey}
    />
  );
}
