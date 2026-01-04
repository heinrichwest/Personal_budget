import { useEffect } from 'react'
import Joyride, { CallBackProps, STATUS, Step } from 'react-joyride'
import { useTour } from '../contexts/TourContext'

interface PageTourProps {
    pageId: string
    steps: Step[]
}

export default function PageTour({ pageId, steps }: PageTourProps) {
    const { registerTour, runTour, handleTourEnd, currentPageId } = useTour()

    useEffect(() => {
        registerTour(pageId, steps)
    }, [pageId]) // Re-register if pageId changes, though usually component unmounts

    // Don't render Joyride if this isn't the active page tour
    // This prevents multiple Joyride instances if pages are kept alive or nested
    if (currentPageId !== pageId) return null

    const handleCallback = (data: CallBackProps) => {
        const { status } = data
        if ([STATUS.FINISHED, STATUS.SKIPPED].includes(status as any)) {
            handleTourEnd()
        }
    }

    return (
        <Joyride
            steps={steps}
            run={runTour}
            continuous
            showSkipButton
            showProgress
            styles={{
                options: {
                    primaryColor: '#0052cc',
                    zIndex: 10000,
                }
            }}
            callback={handleCallback}
        />
    )
}
