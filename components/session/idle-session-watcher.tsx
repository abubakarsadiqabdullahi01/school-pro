"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { signOut } from "next-auth/react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { sessionHeartbeat, staySignedIn } from "@/app/actions/session-security"

/**
 * The browser half of idle sign-out: a countdown, a warning, and a way to stay.
 *
 * **The server is the authority.** This component cannot keep anybody signed in and cannot
 * sign anybody out — `requireActor` decides that on every action, whatever this does. What
 * it adds is the thing a server cannot: telling somebody *before* it happens, so a teacher
 * halfway through entering a class's marks is warned rather than losing the page.
 *
 * Three behaviours are worth knowing about:
 *
 *  - **Real interaction extends the session; polling does not.** Moving the mouse sends a
 *    keep-alive, throttled hard. The countdown itself goes through a read-only heartbeat,
 *    because a poll that refreshed the clock would mean an open tab never expires — which
 *    is how idle timeouts end up being theatre.
 *  - **The warning dialog stops extending.** Once the dialog is up, local activity no
 *    longer counts. Somebody reading the warning is moving their mouse towards it; that is
 *    not a reason to cancel it silently behind them.
 *  - **It polls slowly when there is time, and quickly near the end.** One request a
 *    minute while there are hours left is enough to notice a session revoked on another
 *    device; once inside the warning window it tightens to every few seconds.
 */

/** Local activity within this window counts as one event, not hundreds. */
const ACTIVITY_THROTTLE_MS = 120_000
/** How often to ask the server while the session is comfortable. */
const IDLE_POLL_MS = 60_000
/** How often to ask once the warning is close or showing. */
const URGENT_POLL_MS = 5_000
/** Below this many seconds remaining, poll urgently. */
const URGENT_THRESHOLD_SECONDS = 180

const ACTIVITY_EVENTS = ["mousedown", "keydown", "touchstart", "scroll"] as const

export function IdleSessionWatcher() {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const [warning, setWarning] = useState(false)
  const [extending, setExtending] = useState(false)

  // Refs rather than state: these are read inside listeners and timers that must not be
  // re-created on every tick.
  const lastKeepAlive = useRef(0)
  const warningRef = useRef(false)
  const endedRef = useRef(false)

  warningRef.current = warning

  const endSession = useCallback(async (reason?: string) => {
    if (endedRef.current) return
    endedRef.current = true
    const query = reason ? `?reason=${encodeURIComponent(reason)}` : ""
    await signOut({ callbackUrl: `/auth/login${query}` })
  }, [])

  /** Reads the clock without resetting it. */
  const poll = useCallback(async () => {
    if (endedRef.current) return
    try {
      const beat = await sessionHeartbeat()

      if (!beat.alive) {
        await endSession(beat.reason)
        return
      }

      // Null means nothing is counting down — a legacy token, or idle expiry switched off.
      // Leave the dialog closed and stop tracking a countdown that does not exist.
      if (beat.secondsRemaining === null) {
        setSecondsLeft(null)
        setWarning(false)
        return
      }

      setSecondsLeft(beat.secondsRemaining)
      setWarning(beat.warningSeconds > 0 && beat.secondsRemaining <= beat.warningSeconds)
    } catch {
      // A failed heartbeat is a network blip, not an expiry. Staying quiet is right: the
      // server still enforces the limit on the next real action.
    }
  }, [endSession])

  /** Tells the server this person is still here. Only ever from real interaction. */
  const keepAlive = useCallback(async () => {
    const now = Date.now()
    if (now - lastKeepAlive.current < ACTIVITY_THROTTLE_MS) return
    lastKeepAlive.current = now
    try {
      await staySignedIn()
    } catch {
      /* see poll */
    }
  }, [])

  // Local activity -> keep-alive, except while the warning is up.
  useEffect(() => {
    const onActivity = () => {
      if (warningRef.current || endedRef.current) return
      void keepAlive()
    }
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, onActivity, { passive: true })
    }
    return () => {
      for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, onActivity)
    }
  }, [keepAlive])

  // The poll loop. A self-rescheduling timeout rather than an interval, so the cadence can
  // change with how much time is left without tearing the effect down.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let cancelled = false

    const tick = async () => {
      await poll()
      if (cancelled || endedRef.current) return
      const urgent =
        warningRef.current || (secondsLeft !== null && secondsLeft <= URGENT_THRESHOLD_SECONDS)
      timer = setTimeout(tick, urgent ? URGENT_POLL_MS : IDLE_POLL_MS)
    }

    void tick()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
    // `secondsLeft` intentionally excluded: including it would restart the loop on every
    // tick. The cadence is re-read inside `tick` from the ref and the latest render's value,
    // which is close enough for a poll interval and avoids a timer storm.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poll])

  // The visible countdown between polls, so the number moves once a second rather than
  // jumping in five-second steps.
  useEffect(() => {
    if (!warning || secondsLeft === null) return
    const timer = setInterval(() => {
      setSecondsLeft((current) => {
        if (current === null) return null
        const next = current - 1
        if (next <= 0) {
          void endSession("You were signed out because the session was left unused.")
          return 0
        }
        return next
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [warning, secondsLeft === null, endSession])

  // Coming back to a tab that was in the background is the moment most likely to find an
  // expired session, so ask immediately rather than waiting out the poll interval.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void poll()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => document.removeEventListener("visibilitychange", onVisible)
  }, [poll])

  const onStay = async () => {
    setExtending(true)
    try {
      const result = await staySignedIn()
      if (!result.success) {
        await endSession("Your session has reached its maximum length.")
        return
      }
      lastKeepAlive.current = Date.now()
      setWarning(false)
      await poll()
    } finally {
      setExtending(false)
    }
  }

  if (!warning || secondsLeft === null) return null

  // AlertDialog rather than Dialog: this is a decision, not a notification. It has no
  // close button, and dismissing it by clicking away would leave somebody believing they
  // had dealt with it while the clock carried on.
  return (
    <AlertDialog open>
      <AlertDialogContent
        className="sm:max-w-md"
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Still there?</AlertDialogTitle>
          <AlertDialogDescription>
            You have not used this page for a while. For security you will be signed out in{" "}
            <span className="font-semibold tabular-nums text-foreground">
              {formatCountdown(secondsLeft)}
            </span>
            . Anything unsaved will be lost.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-2">
          <AlertDialogCancel disabled={extending} onClick={() => void endSession()}>
            Sign out now
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={extending}
            onClick={(event) => {
              // Keep the dialog mounted until the server has actually extended the session;
              // Radix would otherwise close it on click and hide a failure.
              event.preventDefault()
              void onStay()
            }}
          >
            {extending ? "Staying\u2026" : "Stay signed in"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function formatCountdown(seconds: number): string {
  if (seconds >= 60) {
    const minutes = Math.floor(seconds / 60)
    const rest = seconds % 60
    return rest === 0
      ? `${minutes} minute${minutes === 1 ? "" : "s"}`
      : `${minutes}m ${String(rest).padStart(2, "0")}s`
  }
  return `${seconds} second${seconds === 1 ? "" : "s"}`
}
