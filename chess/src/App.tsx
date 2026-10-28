import { createHashRouter, RouterProvider } from 'react-router'
import { Layout } from './components/Layout'
import { CoordinatesPage } from './pages/CoordinatesPage'
import { CoursePage } from './pages/CoursePage'
import { DashboardPage } from './pages/DashboardPage'
import { EditorPage } from './pages/EditorPage'
import { OpeningsPage } from './pages/OpeningsPage'
import { SettingsPage } from './pages/SettingsPage'
import { TrainerPage } from './pages/TrainerPage'

// Хэш-роутинг: приложение работает на любом статическом хостинге (в т.ч. GitHub Pages в подпапке).
const router = createHashRouter([
  {
    element: <Layout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'coordinates', element: <CoordinatesPage /> },
      { path: 'openings', element: <OpeningsPage /> },
      { path: 'openings/new', element: <EditorPage /> },
      { path: 'openings/:courseId', element: <CoursePage /> },
      { path: 'openings/:courseId/edit', element: <EditorPage /> },
      { path: 'openings/:courseId/train', element: <TrainerPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: '*', element: <DashboardPage /> },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
