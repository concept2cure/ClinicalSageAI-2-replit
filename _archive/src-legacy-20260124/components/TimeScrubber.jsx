import React, { useEffect, useState } from 'react';
import dayjs from 'dayjs';
export default function TimeScrubber({ min, max, from, to, onChange }) {
  const [minVal, setMin] = useState(from || min);
  const [maxVal, setMax] = useState(to || max);
  useEffect(() => {
    onChange(minVal, maxVal);
  }, [minVal, maxVal]);
  const pct = v => (100 * (dayjs(v) - dayjs(min))) / (dayjs(max) - dayjs(min));
  return (
    <div className="my-2">
      <input
        type="range"
        min={min}
        max={max}
        value={minVal}
        onChange={e => setMin(e.target.value)}
        className="w-full"
      />
      <input
        type="range"
        min={min}
        max={max}
        value={maxVal}
        onChange={e => setMax(e.target.value)}
        className="w-full -mt-2"
      />
      <div className="text-xs flex justify-between">
        <span>{minVal}</span>
        <span>{maxVal}</span>
      </div>
    </div>
  );
}
