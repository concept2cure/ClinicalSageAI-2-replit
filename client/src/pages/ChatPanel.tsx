import React, { useState } from 'react';
import ChatPanel from '../components/ChatPanel';
import TopNavigation from '../components/TopNavigation';
import { Button } from '@/components/ui/button';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Book, Box, FileText, Beaker, CheckCheck, ChevronsDown, Bot, Layout } from 'lucide-react'

export default function ChatPanelPage() {
  const [selectedContext, setSelectedContext] = useState('general');
  const [open, setOpen] = useState(false);

  const contexts = [
    {
      value: 'general',
      label: 'General Regulatory',
      icon: <Bot className="h-4 w-4 mr-2" />,
      description: 'General regulatory document assistance',
    },
    {
      value: 'csr',
      label: 'CSR',
      icon: <Book className="h-4 w-4 mr-2" />,
      description: 'Clinical Study Report guidance',
    },
    {
      value: 'protocol',
      label: 'Protocol',
      icon: <FileText className="h-4 w-4 mr-2" />,
      description: 'Clinical Protocol development',
    },
    {
      value: 'ind',
      label: 'IND',
      icon: <Box className="h-4 w-4 mr-2" />,
      description: 'Investigational New Drug submissions',
    },
    {
      value: 'nda',
      label: 'NDA',
      icon: <CheckCheck className="h-4 w-4 mr-2" />,
      description: 'New Drug Application guidance',
    },
    {
      value: 'research',
      label: 'Research',
      icon: <Beaker className="h-4 w-4 mr-2" />,
      description: 'Clinical research guidance',
    },
  ];

  const selectedItem = contexts.find(context => context.value === selectedContext);

  return (
    <Layout>
      <TopNavigation />

      <div className="container mx-auto py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">TrialSage AI Chat</h1>

          <div className="flex space-x-2">
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="flex justify-between items-center w-40">
                  <div className="flex items-center">
                    {selectedItem?.icon}
                    <span>{selectedItem?.label}</span>
                  </div>
                  <ChevronsDown className="h-4 w-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[240px] p-0" align="end">
                <Command>
                  <CommandInput placeholder="Search context..." />
                  <CommandList>
                    <CommandEmpty>No context found.</CommandEmpty>
                    <CommandGroup>
                      {contexts.map(context => (
                        <CommandItem
                          key={context.value}
                          onSelect={() => {
                            setSelectedContext(context.value);
                            setOpen(false);
                          }}
                        >
                          <div className="flex items-center">
                            {context.icon}
                            <div>
                              <p className="font-medium">{context.label}</p>
                              <p className="text-xs text-gray-500">{context.description}</p>
                            </div>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md overflow-hidden mb-6">
          <div className="h-[75vh]">
            <ChatPanel context={selectedContext} showSuggestions={true} />
          </div>
        </div>
      </div>
    </Layout>
  );
}
