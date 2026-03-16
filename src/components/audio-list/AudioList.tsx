import React from 'react';
import { AudioCard } from './AudioCard';

// 定义单个音频对象的数据结构
export interface AudioItem {
  id: string;
  spotName: string;
  audioUrl: string;
}

// 定义抽屉组件的参数
interface AudioListProps {
  isOpen: boolean;           // 抽屉是开还是关
  onClose: () => void;       // 点击关闭时的回调函数
  items: AudioItem[];        // 音频数据列表
}

export const AudioList: React.FC<AudioListProps> = ({ isOpen, onClose, items }) => {
  
  // 核心互斥逻辑：只要有一个音频开始播，页面上其他所有的 audio 统统闭嘴
  const handleGlobalPlay = (e: React.SyntheticEvent<HTMLAudioElement, Event>) => {
    const currentAudio = e.target as HTMLAudioElement;
    // 霸道操作：抓取页面上所有的 <audio> 标签（包括聊天气泡里的！）
    const allAudios = document.querySelectorAll('audio');
    
    allAudios.forEach((audio) => {
      if (audio !== currentAudio) {
        audio.pause();
      }
    });
  };

  return (
    <>
      {/* 1. 遮罩层 (Overlay) */}
      {/* 当 isOpen 为 true 时显示，点击黑底就触发 onClose 关闭抽屉 */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 transition-opacity backdrop-blur-sm"
          onClick={onClose}
        />
      )}

      {/* 2. 抽屉本体 (Drawer) */}
      {/* 用 translate-x 来实现丝滑的从右侧滑入/滑出效果 */}
      <div
        className={`fixed top-0 right-0 h-full w-full sm:w-[400px] bg-gray-50 z-50 transform transition-transform duration-300 ease-in-out flex flex-col ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* 抽屉头部 */}
        <div className="px-6 py-2 border-b border-gray-200 bg-white flex justify-between items-center z-10">
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            我的导览库
          </h2>
          <button
            onClick={onClose}
            className="p-0 text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            title="关闭"
          >
            {/* 画个简单的 X 图标 */}
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 抽屉内容区（列表循环渲染） */}
        <div className="flex-1 overflow-y-auto px-2 py-2 sm:py-2">
          {items.length === 0 ? (
            // 空状态展示
            <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-3">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
              <p>当前会话还没有生成过导览音频哦~</p>
            </div>
          ) : (
            // 循环渲染 AudioCard
            items.map((item) => (
              <AudioCard
                key={item.id}
                spotName={item.spotName}
                audioUrl={item.audioUrl}
                onPlay={handleGlobalPlay}
              />
            ))
          )}
        </div>
      </div>
    </>
  );
};