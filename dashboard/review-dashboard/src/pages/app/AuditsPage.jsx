import { useNavigate } from 'react-router-dom';
import { HistoryPage as AuditsHistoryPage } from '../../App.jsx';

export default function AuditsPage() {
  const navigate = useNavigate();

  return <AuditsHistoryPage onLoadReport={(row) => navigate(`/app/audits/${row.report_id}`)} />;
}
