import React, { useState, useRef, useEffect } from 'react';
import { Container } from '@/components/ui/container';
import { Button } from '@/components/ui/button';

export default function EnhancedVideoWalkthroughs() {
  const [activeVideo, setActiveVideo] = useState('hero');
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef(null);
  const containerRef = useRef(null);

  const placeholderPoster = '/videos/video_coming_soon.svg';

  const videos = {
    hero: {
      title: 'Why Concept2Cure Exists',
      description:
        'From concept to clinic in half the time with AI-powered regulatory intelligence.',
      src: '', // Will be populated with actual video later
      poster: '/videos/hero_intro_poster.svg',
      thumbnail: '/assets/thumb_hero.svg',
      captions: '/videos/hero_captions.vtt',
      duration: '60s',
      script: `At the heart of every biotech breakthrough is one question: how fast can you move from concept to clinic?
      
But static PDFs, siloed platforms, and manual processes still waste months of your team's time.

Concept2Cure changes everything — by unifying IND automation, real-time CSR analytics, automated CER generation, and predictive risk modeling in one platform.

Imagine compressing 14 months of work into just 6 months — without a single surprise.

With AI copilots built for regulatory experts, you file faster, smarter, and with total confidence.

Ready to lead the future of clinical development? Book your strategy demo with Concept2Cure today.`,
      ctaText: 'Book Your Strategy Demo',
      ctaLink: '/contact',
      color: 'bg-gradient-to-r from-blue-600 to-indigo-700',
    },
    ind: {
      title: 'IND Architect™ Deep Dive',
      description: 'Auto-generate regulatory submissions with AI validation and one-click filing.',
      src: '', // Will be populated with actual video later
      poster: '/videos/ind_architect_poster.svg',
      thumbnail: '/assets/thumb_ind.svg',
      captions: '/videos/ind_captions.vtt',
      duration: '75s',
      script: `Welcome to IND Architect™ — your AI-powered submission engine.

Step one, click to auto-generate Modules 1 through 5 in seconds. No manual copy-paste.

Our real-time gap checker validates every section against FDA and EMA guidelines — flags any missing data instantly.

Connect directly to the FDA's ESG gateway via secure SFTP for one-click submissions.

Finally, leverage AI suggestions for your clinical overview and risk rationales — drafted and ready for review.

Say goodbye to 12+ month timelines and costly rework. With IND Architect™, you file 60% faster, every time.

See IND Architect™ in action — book your live demo now.`,
      ctaText: 'See IND Architect in Action',
      ctaLink: '/demo/ind',
      color: 'bg-gradient-to-r from-emerald-500 to-teal-700',
    },
    clinops: {
      title: 'ClinOps in Real Time',
      description:
        'Monitor enrollment, spot safety signals, and run what-if simulations in real-time.',
      src: '', // Will be populated with actual video later
      poster: '/videos/clinops_poster.svg',
      thumbnail: '/assets/thumb_clinops.svg',
      captions: '/videos/clinops_captions.vtt',
      duration: '60s',
      script: `Running a clinical trial? Data shouldn't have to wait.

Monitor live enrollment across all sites in a single dashboard — no spreadsheets required.

Spot safety signals instantly with color-coded risk maps — protect your patients and your program.

Run what-if protocol simulations to forecast timelines and outcomes before you invest another dollar.

Get automated alerts when thresholds are breached — so you can act before issues escalate.

From data chaos to total visibility — ClinOps on Concept2Cure gives you the insight to lead.

Explore ClinOps Advantage — request your personalized walkthrough today.`,
      ctaText: 'Request Personalized Walkthrough',
      ctaLink: '/demo/clinops',
      color: 'bg-gradient-to-r from-purple-600 to-indigo-800',
    },
  };

  const handleTabChange = videoKey => {
    if (activeVideo === videoKey) return;

    setIsPlaying(false);
    setActiveVideo(videoKey);

    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.load();
    }
  };

  const togglePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  useEffect(() => {
    const handleIntersection = entries => {
      const [entry] = entries;
      if (entry.isIntersecting && !isPlaying && videoRef.current) {
        videoRef.current.play().catch(error => {
          console.log('Autoplay prevented:', error);
        });
        setIsPlaying(true);
      }
    };

    const observer = new IntersectionObserver(handleIntersection, {
      threshold: 0.7,
    });

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    // Video event listeners
    const videoElement = videoRef.current;

    const handleVideoEnd = () => setIsPlaying(false);
    const handleVideoPlay = () => setIsPlaying(true);
    const handleVideoPause = () => setIsPlaying(false);

    if (videoElement) {
      videoElement.addEventListener('ended', handleVideoEnd);
      videoElement.addEventListener('play', handleVideoPlay);
      videoElement.addEventListener('pause', handleVideoPause);
    }

    return () => {
      if (containerRef.current) {
        observer.unobserve(containerRef.current);
      }

      if (videoElement) {
        videoElement.removeEventListener('ended', handleVideoEnd);
        videoElement.removeEventListener('play', handleVideoPlay);
        videoElement.removeEventListener('pause', handleVideoPause);
      }
    };
  }, [activeVideo, isPlaying]);

  return (
    <div className="bg-gray-900 text-white py-20">
      <Container>
        <div className="text-center mb-16">
          <h2 className="text-5xl font-bold mb-6">See Concept2Cure in Action</h2>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto mb-4">
            Watch guided demonstrations of our platform's core capabilities and see how Concept2Cure
            accelerates clinical development
          </p>
          <div className="bg-blue-900/30 border border-blue-500/40 rounded-lg py-3 px-5 text-blue-300 text-sm inline-block">
            <span className="font-medium">Note:</span> Videos are in production. Transcripts are
            available below each placeholder.
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-12">
          {Object.entries(videos).map(([key, video]) => (
            <div
              key={key}
              onClick={() => handleTabChange(key)}
              className={`cursor-pointer rounded-xl overflow-hidden transition-all duration-300 transform ${
                activeVideo === key
                  ? 'ring-4 ring-offset-4 ring-blue-500 scale-105'
                  : 'hover:scale-102 opacity-90 hover:opacity-100'
              }`}
            >
              <div className={`aspect-video relative ${video.color}`}>
                <img
                  src={video.thumbnail}
                  alt={video.title}
                  className="w-full h-full object-cover opacity-80 hover:opacity-100 transition-opacity"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div
                    className={`h-14 w-14 rounded-full bg-white bg-opacity-20 backdrop-filter backdrop-blur-sm flex items-center justify-center ${
                      activeVideo === key ? 'scale-110' : ''
                    }`}
                  >
                    <span className="text-white text-2xl">{activeVideo === key ? '▶' : '○'}</span>
                  </div>
                </div>
              </div>
              <div className="p-4 bg-gray-800">
                <h3 className="font-bold text-lg mb-1">{video.title}</h3>
                <p className="text-gray-300 text-sm">{video.duration}</p>
              </div>
            </div>
          ))}
        </div>

        <div ref={containerRef} className="rounded-2xl overflow-hidden shadow-2xl bg-black mb-10">
          <div className="relative aspect-video bg-gray-900">
            <video
              ref={videoRef}
              poster={videos[activeVideo].poster}
              className="w-full h-full object-contain"
              playsInline
              preload="metadata"
            >
              <source src={videos[activeVideo].src} type="video/mp4" />
              <track kind="captions" src={videos[activeVideo].captions} label="English" default />
              Your browser does not support the video tag.
            </video>

            <div
              className="absolute inset-0 flex items-center justify-center cursor-pointer"
              onClick={togglePlayPause}
            >
              {!isPlaying && (
                <div className="h-20 w-20 rounded-full bg-white bg-opacity-25 backdrop-filter backdrop-blur-sm flex items-center justify-center">
                  <span className="text-white text-4xl">▶</span>
                </div>
              )}
            </div>

            <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black to-transparent">
              <h3 className="text-2xl font-bold">{videos[activeVideo].title}</h3>
              <p className="text-gray-300 mt-2 max-w-2xl">{videos[activeVideo].description}</p>
            </div>
          </div>

          <div className="p-6 bg-gray-800">
            <h4 className="text-lg font-medium text-white mb-3">Video Transcript</h4>
            <div className="bg-gray-900 rounded-lg p-4 text-gray-300 whitespace-pre-line mb-4 max-h-60 overflow-y-auto">
              {videos[activeVideo].script}
            </div>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex space-x-3">
                <Button
                  className={`${videos[activeVideo].color.replace('bg-gradient-to-r ', '')} text-white px-6`}
                  onClick={() => (window.location.href = videos[activeVideo].ctaLink)}
                >
                  {videos[activeVideo].ctaText}
                </Button>
                <Button variant="outline" className="border-gray-700 text-white hover:bg-gray-800">
                  Share
                </Button>
              </div>
              <div className="text-sm text-gray-400">
                Video {Object.keys(videos).indexOf(activeVideo) + 1} of {Object.keys(videos).length}
              </div>
            </div>
          </div>
        </div>
      </Container>
    </div>
  );
}
