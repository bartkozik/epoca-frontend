import styles from './DemoShell.module.scss';

export function DemoGuide(): JSX.Element {
  return (
    <ol className={styles.guide}>
      <li>
        <strong>Log your time.</strong> Open Working time, add an entry, choose a project and edit its duration.
      </li>
      <li>
        <strong>Explore the workspace.</strong> Browse fictional clients and projects, or create your own.
      </li>
      <li>
        <strong>Read the reports.</strong> Compare time by person, client or project using the seeded team activity.
      </li>
      <li>
        <strong>Start fresh.</strong> Reset demo restores a new sample workspace, without changing another visitor’s
        data.
      </li>
    </ol>
  );
}
