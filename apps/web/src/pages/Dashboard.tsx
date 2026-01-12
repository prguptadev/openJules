import { TaskInput } from '../components/features/TaskInput';
import { TaskList } from '../components/features/TaskList';

export default function Dashboard() {
  return (
    <div className="h-full overflow-y-auto scrollbar-none">
      <div className="max-w-5xl mx-auto p-6 lg:p-10 space-y-10">
        <header>
          <h1 className="text-3xl font-bold text-white mb-2">Welcome back, Developer</h1>
          <p className="text-gray-400">What would you like to build today?</p>
        </header>

        <section>
          <TaskInput />
        </section>

        <section>
          <TaskList />
        </section>
      </div>
    </div>
  );
}
