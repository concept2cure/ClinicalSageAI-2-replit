import React from 'react';
import { useLocation } from 'wouter';
import { CheckCircle, ChevronRight } from 'lucide-react';
import Layout from '../components/Layout';
import { useAuth } from '../hooks/use-auth';

const SubscribedSolutions = () => {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  // Hardcoded solutions for demo purposes
  const subscribedSolutions = [
    {
      id: 1,
      name: 'IND Wizard',
      description: 'Automate IND application creation',
      icon: 'flask',
      status: 'active',
      route: '/solutions/ind-wizard',
    },
    {
      id: 2,
      name: 'CSR Deep Intelligence',
      description: 'Advanced clinical study report analytics',
      icon: 'chart-line',
      status: 'active',
      route: '/solutions/csr-intelligence',
    },
    {
      id: 3,
      name: 'CMC Insights',
      description: 'Chemistry, Manufacturing & Controls management',
      icon: 'atom',
      status: 'active',
      route: '/solutions/cmc-insights',
    },
    {
      id: 4,
      name: 'Ask Lumen',
      description: 'AI regulatory compliance assistant',
      icon: 'robot',
      status: 'active',
      route: '/solutions/ask-lumen',
    },
    {
      id: 5,
      name: 'Protocol Optimization',
      description: 'Clinical protocol design and optimization',
      icon: 'sitemap',
      status: 'active',
      route: '/solutions/protocol-optimization',
    },
  ];

  const getIconClassName = iconName => {
    const iconMap = {
      flask: 'bg-blue-100 text-blue-700',
      'chart-line': 'bg-green-100 text-green-700',
      atom: 'bg-purple-100 text-purple-700',
      robot: 'bg-orange-100 text-orange-700',
      sitemap: 'bg-indigo-100 text-indigo-700',
    };

    return iconMap[iconName] || 'bg-gray-100 text-gray-700';
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row justify-between items-start mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Your TrialSage Solutions</h1>
            <p className="text-gray-600 mt-2">Welcome back, {user?.name || 'Valued Customer'}</p>
          </div>

          <div className="mt-4 md:mt-0">
            <button
              onClick={() => setLocation('/account')}
              className="px-4 py-2 bg-white border border-gray-300 rounded-md text-gray-700 flex items-center hover:bg-gray-50"
            >
              Manage Account
              <ChevronRight className="ml-2 h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {subscribedSolutions.map(solution => (
            <div
              key={solution.id}
              className="border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow duration-200 cursor-pointer"
              onClick={() => setLocation(solution.route)}
            >
              <div className="flex items-start">
                <div className={`p-3 rounded-full mr-4 ${getIconClassName(solution.icon)}`}>
                  <span className="text-xl">
                    {solution.icon === 'flask' && '🧪'}
                    {solution.icon === 'chart-line' && '📊'}
                    {solution.icon === 'atom' && '⚛️'}
                    {solution.icon === 'robot' && '🤖'}
                    {solution.icon === 'sitemap' && '🔄'}
                  </span>
                </div>

                <div className="flex-1">
                  <div className="flex justify-between items-start">
                    <h3 className="text-lg font-semibold text-gray-900">{solution.name}</h3>
                    <div className="flex items-center text-sm font-medium text-green-600">
                      <CheckCircle className="h-4 w-4 mr-1" />
                      Active
                    </div>
                  </div>

                  <p className="mt-2 text-gray-600">{solution.description}</p>

                  <button
                    className="mt-4 inline-flex items-center text-sm font-medium text-blue-600"
                    onClick={e => {
                      e.stopPropagation();
                      setLocation(solution.route);
                    }}
                  >
                    Launch
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
};

export default SubscribedSolutions;
