type Props = {
  title: string;
  sessionReason: string;
  sessionPresenceLine?: string;
  currentTask: number;
  totalTasks: number;
  sessionGoal: string;
  sessionIntro?: string;
  relapseNotice?: string;
};

export function taskProgressPercent(currentTask: number, totalTasks: number): number {
  if (!Number.isFinite(currentTask) || !Number.isFinite(totalTasks) || totalTasks <= 0) return 0;
  const clamped = Math.min(Math.max(currentTask, 0), totalTasks);
  return Math.round((clamped / totalTasks) * 100);
}

export function TutorSessionHeader({
  title,
  sessionReason,
  sessionPresenceLine,
  currentTask,
  totalTasks,
  sessionGoal,
  sessionIntro,
  relapseNotice,
}: Props) {
  return (
    <div>
      <p>
        <strong>Heute trainierst du</strong>
      </p>
      <h3>{title}</h3>
      {relapseNotice ? <p className="tutor-relapse-notice">{relapseNotice}</p> : null}
      {sessionReason ? <p>{sessionReason}</p> : null}
      {sessionPresenceLine ? <p className="tutor-session-intro">{sessionPresenceLine}</p> : null}
      <div className="tutor-task-progress">
        <p>
          <strong>
            Aufgabe {currentTask} von {totalTasks}
          </strong>
        </p>
        <div
          className="progress-meter"
          role="progressbar"
          aria-valuenow={currentTask}
          aria-valuemin={0}
          aria-valuemax={totalTasks}
          aria-label={`Aufgabe ${currentTask} von ${totalTasks}`}
        >
          <div
            className="progress-meter-fill"
            style={{
              width: `${taskProgressPercent(currentTask, totalTasks)}%`,
              background: 'var(--accent)',
            }}
          />
        </div>
      </div>
      <p>
        <strong>Ziel für heute:</strong> {sessionGoal}
      </p>
      {sessionIntro ? <p className="tutor-session-intro">{sessionIntro}</p> : null}
    </div>
  );
}
