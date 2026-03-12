import { useState } from 'react';
import { DemoPage as DemoExperience } from '../../App.jsx';

export default function DemoPage() {
  const [report, setReport] = useState(null);

  return <DemoExperience report={report} onReportReady={setReport} />;
}
