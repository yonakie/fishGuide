import React from "react";

// 定义传给卡片的数据长什么样
export interface AudioCardProps {
  spotName: string;
  audioUrl: string;
  onPlay: (e: React.SyntheticEvent<HTMLAudioElement, Event>) => void;
}

export const AudioCard: React.FC<AudioCardProps> = ({
  spotName,
  audioUrl,
  onPlay
}) => {
  return (
    <div className="bg-white p-4 rounded-lg border border-gray-100 mb-3 hover:border-blue-500">
      {/* 景点名称 */}
      <h3 className="text-base font-bold text-gray-800 mb-3 pl-1 border-l-4 border-blue-500">
        {spotName}
      </h3>

      {/* 原生音频播放器 */}
      {/* onPlay 触发时，会执行外面 AudioList 传进来的“互斥闭嘴”逻辑 */}
      <audio
        controls
        src={audioUrl}
        onPlay={onPlay}
        className="w-full h-10 outline-none"
      />
    </div>
  );
};
