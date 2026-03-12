import { useNavigate } from 'react-router-dom';
import { HistoryPage as RunsHistoryPage } from '../../App.jsx';

export default function RunsPage() {
  const navigate = useNavigate();

  return <RunsHistoryPage onLoadReport={(row) => navigate(`/app/runs/${row.report_id}`)} />;
}
