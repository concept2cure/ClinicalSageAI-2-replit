import React, { useState, useRef } from 'react';
import { Container } from '@/components/ui/container';
import { Button } from '@/components/ui/button';

export default function VideoWalkthroughs() {
  const [activeVideo, setActiveVideo] = useState('hero');
  const videoRef = useRef(null);

  const videos = {
    hero: {
      title: 'Why TrialSage Exists',
      description:
        'Learn how TrialSage transforms the clinical development process from concept to clinic.',
      src: '/videos/hero_intro.mp4',
      poster: '/videos/hero_intro_poster.jpg',
      duration: '60s',
      ctaText: 'Book Your Strategy Demo',
      ctaLink: '/contact',
    },
    ind: {
      title: 'IND Architect™ Deep Dive',
      description: 'See how our AI-powered submission engine cuts IND filing time by 60%.',
      src: '/videos/ind_architect.mp4',
      poster: '/videos/ind_architect_poster.jpg',
      duration: '75s',
      ctaText: 'See IND Architect in Action',
      ctaLink: '/demo/ind',
    },
    clinops: {
      title: 'ClinOps in Real Time',
      description:
        'Transform your clinical operations with real-time monitoring and predictive analytics.',
      src: '/videos/clinops.mp4',
      poster: '/videos/clinops_poster.jpg',
      duration: '60s',
      ctaText: 'Request Personalized Walkthrough',
      ctaLink: '/demo/clinops',
    },
  };

  const handleTabChange = videoKey => {
    setActiveVideo(videoKey);
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.load();
    }
  };

  return (
    <div className="bg-gray-50 py-16">
      <Container>
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold text-gray-900 mb-4">Video Walkthroughs</h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            See TrialSage in action with guided tours of our core capabilities
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-md overflow-hidden">
          {/* Video Selection Tabs */}
          <div className="flex border-b border-gray-200">
            {Object.entries(videos).map(([key, video]) => (
              <button
                key={key}
                className={`flex-1 py-4 px-6 text-left transition-colors ${
                  activeVideo === key
                    ? 'bg-blue-50 border-b-2 border-blue-600 text-blue-600'
                    : 'hover:bg-gray-50'
                }`}
                onClick={() => handleTabChange(key)}
              >
                <h3 className="font-medium">{video.title}</h3>
                <p className="text-sm text-gray-500">{video.duration}</p>
              </button>
            ))}
          </div>

          {/* Video Player */}
          <div className="p-6">
            <div className="aspect-video bg-gray-100 rounded-lg overflow-hidden mb-6">
              <video
                ref={videoRef}
                controls
                poster={videos[activeVideo].poster}
                className="w-full h-full object-cover"
              >
                <source src={videos[activeVideo].src} type="video/mp4" />
                <track
                  kind="captions"
                  src={`/videos/${activeVideo}_captions.vtt`}
                  label="English"
                />
                Your browser does not support the video tag.
              </video>
            </div>

            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h3 className="text-2xl font-bold text-gray-900">{videos[activeVideo].title}</h3>
                <p className="text-gray-600 mt-2">{videos[activeVideo].description}</p>
              </div>
              <Button
                className="bg-blue-600 hover:bg-blue-700 text-white px-6"
                onClick={() => (window.location.href = videos[activeVideo].ctaLink)}
              >
                {videos[activeVideo].ctaText}
              </Button>
            </div>
          </div>
        </div>
      </Container>
    </div>
  );
}
