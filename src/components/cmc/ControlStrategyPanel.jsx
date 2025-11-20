import React from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Shield, FileSearch } from 'lucide-react';

export default function ControlStrategyPanel() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center">
          <Shield className="h-4 w-4 mr-2" />
          Control Strategy
        </CardTitle>
        <CardDescription>Product quality risk management</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <h3 className="text-sm font-medium">Critical Quality Attributes (CQAs)</h3>
          <div className="space-y-3">
            <div className="flex items-start border-l-4 border-blue-500 pl-3 py-1">
              <div>
                <div className="font-medium text-sm">Assay</div>
                <p className="text-xs text-muted-foreground">
                  Control methods: HPLC testing, blend uniformity, process validation
                </p>
              </div>
            </div>

            <div className="flex items-start border-l-4 border-blue-500 pl-3 py-1">
              <div>
                <div className="font-medium text-sm">Dissolution</div>
                <p className="text-xs text-muted-foreground">
                  Control methods: Tablet hardness control, particle size specification, dissolution
                  testing
                </p>
              </div>
            </div>

            <div className="flex items-start border-l-4 border-blue-500 pl-3 py-1">
              <div>
                <div className="font-medium text-sm">Related Substances</div>
                <p className="text-xs text-muted-foreground">
                  Control methods: Raw material purity, process temperature control, packaging
                  protection
                </p>
              </div>
            </div>

            <div className="flex items-start border-l-4 border-amber-500 pl-3 py-1">
              <div>
                <div className="font-medium text-sm">Water Content</div>
                <p className="text-xs text-muted-foreground">
                  Control methods: Environmental controls, packaging moisture barrier
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-medium">Critical Process Parameters (CPPs)</h3>
          <div className="space-y-3">
            <div className="border rounded-md p-2 bg-blue-50">
              <div className="font-medium text-sm">Blending Time</div>
              <div className="text-xs flex justify-between mt-1">
                <span>Target: 20 minutes</span>
                <span>Range: 15-25 minutes</span>
              </div>
            </div>

            <div className="border rounded-md p-2 bg-blue-50">
              <div className="font-medium text-sm">Compression Force</div>
              <div className="text-xs flex justify-between mt-1">
                <span>Target: 15 kN</span>
                <span>Range: 12-18 kN</span>
              </div>
            </div>

            <div className="border rounded-md p-2 bg-blue-50">
              <div className="font-medium text-sm">Tablet Hardness</div>
              <div className="text-xs flex justify-between mt-1">
                <span>Target: 10 kp</span>
                <span>Range: 8-12 kp</span>
              </div>
            </div>

            <div className="border rounded-md p-2 bg-blue-50">
              <div className="font-medium text-sm">Coating Solution Spray Rate</div>
              <div className="text-xs flex justify-between mt-1">
                <span>Target: 30 g/min</span>
                <span>Range: 25-35 g/min</span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <Button variant="outline" size="sm" className="w-full">
          <FileSearch className="h-4 w-4 mr-2" />
          View Control Strategy Document
        </Button>
      </CardFooter>
    </Card>
  );
}
