import { useEffect, useState } from 'react';
import { CameraManager } from '../components/CameraManager';
import { btn, btnPrimary, Card, PageTitle } from '../components/ui';
import { UserManager } from '../components/UserManager';
import { connectArduino, serialSupported } from '../services/arduino';
import { pushToast } from '../store/live';

// Outlives this page so the Arduino stays connected while you browse the dashboard.
let stopArduino: (() => void) | undefined;

function ArduinoCard() {
  const [on, setOn] = useState(!!stopArduino);
  const [supported, setSupported] = useState(true);
  useEffect(() => setSupported(serialSupported()), []); // after mount: the server render has no navigator
  const connect = async () => {
    try {
      stopArduino = await connectArduino(9600, () => { stopArduino = undefined; setOn(false); });
      setOn(true);
      pushToast('success', 'Arduino connected');
    } catch (err) {
      if ((err as Error).name !== 'NotFoundError') pushToast('error', `Could not open the port: ${(err as Error).message}`); // NotFoundError = picker cancelled
    }
  };
  return (
    <Card title="Arduino (USB)">
      <p className="mb-3 text-sm text-slate-400">
        Plug the board in, then connect. Its signal and ultrasonic readings replace the simulated ones for that intersection. Sketch: <code>arduino/traffic_light/traffic_light.ino</code>.
      </p>
      {!supported ? (
        <p className="text-sm text-amber-400">This browser has no Web Serial. Use Chrome or Edge on desktop.</p>
      ) : on ? (
        <button type="button" className={btn} onClick={() => stopArduino?.()}>Disconnect</button>
      ) : (
        <button type="button" className={btnPrimary} onClick={connect}>Connect Arduino</button>
      )}
    </Card>
  );
}

export default function Settings() {
  return (
    <div className="space-y-4">
      <PageTitle title="Settings" sub="Cameras, user accounts and the Arduino connection." />
      <CameraManager />
      <UserManager />
      <ArduinoCard />
    </div>
  );
}
