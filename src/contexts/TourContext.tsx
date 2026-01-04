import React, { createContext, useContext, useState } from 'react'
import { Step } from 'react-joyride'
import { useAuth } from './AuthContext'

interface TourContextType {
    registerTour: (pageId: string, steps: Step[]) => void
    startTour: () => void
    runTour: boolean
    tourSteps: Step[]
    handleTourEnd: () => void
    currentPageId: string | null
}

const TourContext = createContext<TourContextType | undefined>(undefined)

export function useTour() {
    const context = useContext(TourContext)
    if (context === undefined) {
        throw new Error('useTour must be used within a TourProvider')
    }
    return context
}

export function TourProvider({ children }: { children: React.ReactNode }) {
    const { userRole, completeTour } = useAuth()
    const [currentPageId, setCurrentPageId] = useState<string | null>(null)
    const [tourSteps, setTourSteps] = useState<Step[]>([])
    const [runTour, setRunTour] = useState(false)

    // This function is called by individual pages when they mount
    const registerTour = (pageId: string, steps: Step[]) => {
        setCurrentPageId(pageId)
        setTourSteps(steps)

        // Auto-start if not seen yet
        if (userRole && (!userRole.seenTours || !userRole.seenTours.includes(pageId))) {
            // Small timeout to allow render
            setTimeout(() => setRunTour(true), 500)
        } else {
            setRunTour(false)
        }
    }

    const startTour = () => {
        setRunTour(true)
    }

    const handleTourEnd = async () => {
        setRunTour(false)
        if (currentPageId) {
            await completeTour(currentPageId)
        }
    }

    return (
        <TourContext.Provider value={{ registerTour, startTour, runTour, tourSteps, handleTourEnd, currentPageId }}>
            {children}
        </TourContext.Provider>
    )
}
