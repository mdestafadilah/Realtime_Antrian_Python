import { useEffect, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import Antrian from '../pages/antrian'

export const Route = createFileRoute('/antrian')({ component: AntrianRoute })

function AntrianRoute() {
  const navigate = useNavigate()
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    const token = localStorage.getItem('auth_token')
    if (!token) {
      navigate({ to: '/login', replace: true })
      return
    }
    setChecked(true)
  }, [navigate])

  if (!checked) return null

  return <Antrian />
}
