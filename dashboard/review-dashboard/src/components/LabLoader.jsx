export default function LabLoader({ text = 'Lab running...' }) {
  return (
    <div className="lab-loader" aria-live="polite" aria-busy="true">
      <div className="lab-jar" aria-hidden="true">
        <div className="jar-liquid" />
        <div className="jar-bubble jar-b1" />
        <div className="jar-bubble jar-b2" />
        <div className="jar-bubble jar-b3" />
      </div>
      <span>{text}</span>
    </div>
  );
}
