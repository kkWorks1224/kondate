import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'motion/react'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import './index.css'
import { AppShell } from './components/layout/AppShell'
import { PageSkeleton } from './components/layout/PageSkeleton'
import Home from './pages/Home'
import { RouteError } from './components/layout/RouteError'

const Plan = lazy(() => import('./pages/Plan'))
const Recipes = lazy(() => import('./pages/Recipes'))
const RecipeDetail = lazy(() => import('./pages/RecipeDetail'))
const Cook = lazy(() => import('./pages/Cook'))
const Pantry = lazy(() => import('./pages/Pantry'))
const Lunch = lazy(() => import('./pages/Lunch'))
const Health = lazy(() => import('./pages/Health'))
const Settings = lazy(() => import('./pages/Settings'))
const NotFound = lazy(() => import('./pages/NotFound'))

const s = (el: React.ReactNode) => <Suspense fallback={<PageSkeleton />}>{el}</Suspense>

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      {
        errorElement: <RouteError inline />,
        children: [
      { index: true, element: <Home /> },
      { path: 'plan', element: s(<Plan />) },
      { path: 'recipes', element: s(<Recipes />) },
      { path: 'recipes/:id', element: s(<RecipeDetail />) },
      { path: 'cook', element: s(<Cook />) },
      { path: 'pantry', element: s(<Pantry />) },
      { path: 'lunch', element: s(<Lunch />) },
      { path: 'health', element: s(<Health />) },
      { path: 'settings', element: s(<Settings />) },
      { path: '*', element: s(<NotFound />) },
        ],
      },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <RouterProvider router={router} />
    </MotionConfig>
  </StrictMode>,
)
