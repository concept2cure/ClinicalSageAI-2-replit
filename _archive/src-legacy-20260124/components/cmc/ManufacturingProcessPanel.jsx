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
import { FileSearch, BookOpen, FlaskConical } from 'lucide-react';

export default function ManufacturingProcessPanel() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <FlaskConical className="h-5 w-5 mr-2" />
          Manufacturing Process
        </CardTitle>
        <CardDescription>Drug product manufacturing workflow and controls</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <div className="space-y-3">
            <h3 className="text-sm font-medium">Process Overview</h3>
            <p className="text-sm text-muted-foreground">
              The manufacturing process for Parapain 500 mg tablets involves a direct compression
              process with six main steps: weighing, sifting, dry blending, lubrication,
              compression, and film coating.
            </p>

            <div className="flex items-center justify-between border rounded-md p-4 mt-4">
              <div className="text-center flex-1">
                <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center mx-auto">
                  <span className="font-medium">1</span>
                </div>
                <div className="mt-2 text-sm">Weighing</div>
              </div>
              <div className="h-0.5 w-6 bg-muted"></div>
              <div className="text-center flex-1">
                <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center mx-auto">
                  <span className="font-medium">2</span>
                </div>
                <div className="mt-2 text-sm">Sifting</div>
              </div>
              <div className="h-0.5 w-6 bg-muted"></div>
              <div className="text-center flex-1">
                <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center mx-auto">
                  <span className="font-medium">3</span>
                </div>
                <div className="mt-2 text-sm">Blending</div>
              </div>
              <div className="h-0.5 w-6 bg-muted"></div>
              <div className="text-center flex-1">
                <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center mx-auto">
                  <span className="font-medium">4</span>
                </div>
                <div className="mt-2 text-sm">Lubrication</div>
              </div>
              <div className="h-0.5 w-6 bg-muted"></div>
              <div className="text-center flex-1">
                <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center mx-auto">
                  <span className="font-medium">5</span>
                </div>
                <div className="mt-2 text-sm">Compression</div>
              </div>
              <div className="h-0.5 w-6 bg-muted"></div>
              <div className="text-center flex-1">
                <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center mx-auto">
                  <span className="font-medium">6</span>
                </div>
                <div className="mt-2 text-sm">Coating</div>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-medium">Process Parameters and Controls</h3>
            <div className="border rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-left font-medium p-2">Process Step</th>
                    <th className="text-left font-medium p-2">Critical Parameters</th>
                    <th className="text-left font-medium p-2">Controls</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t">
                    <td className="p-2 align-top">Weighing</td>
                    <td className="p-2 align-top">
                      <ul className="list-disc list-inside">
                        <li>Accuracy of weighing</li>
                      </ul>
                    </td>
                    <td className="p-2 align-top">
                      <ul className="list-disc list-inside">
                        <li>Calibrated balances</li>
                        <li>Double verification</li>
                      </ul>
                    </td>
                  </tr>
                  <tr className="border-t">
                    <td className="p-2 align-top">Sifting</td>
                    <td className="p-2 align-top">
                      <ul className="list-disc list-inside">
                        <li>Mesh size</li>
                      </ul>
                    </td>
                    <td className="p-2 align-top">
                      <ul className="list-disc list-inside">
                        <li>Sieve inspection</li>
                        <li>Visual verification</li>
                      </ul>
                    </td>
                  </tr>
                  <tr className="border-t">
                    <td className="p-2 align-top">Blending</td>
                    <td className="p-2 align-top">
                      <ul className="list-disc list-inside">
                        <li>Blending time</li>
                        <li>Blender speed</li>
                        <li>Fill level</li>
                      </ul>
                    </td>
                    <td className="p-2 align-top">
                      <ul className="list-disc list-inside">
                        <li>In-process content uniformity</li>
                        <li>Blend uniformity testing</li>
                      </ul>
                    </td>
                  </tr>
                  <tr className="border-t">
                    <td className="p-2 align-top">Compression</td>
                    <td className="p-2 align-top">
                      <ul className="list-disc list-inside">
                        <li>Compression force</li>
                        <li>Tablet hardness</li>
                        <li>Tablet weight</li>
                      </ul>
                    </td>
                    <td className="p-2 align-top">
                      <ul className="list-disc list-inside">
                        <li>In-process tablet testing</li>
                        <li>Automatic weight control</li>
                        <li>Hardness testing</li>
                      </ul>
                    </td>
                  </tr>
                  <tr className="border-t">
                    <td className="p-2 align-top">Coating</td>
                    <td className="p-2 align-top">
                      <ul className="list-disc list-inside">
                        <li>Coating solution spray rate</li>
                        <li>Inlet air temperature</li>
                        <li>Pan speed</li>
                      </ul>
                    </td>
                    <td className="p-2 align-top">
                      <ul className="list-disc list-inside">
                        <li>Coating weight gain</li>
                        <li>Visual appearance</li>
                        <li>Dissolution testing</li>
                      </ul>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-medium">Manufacturing Sites</h3>
            <div className="border rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-left font-medium p-2">Site Name</th>
                    <th className="text-left font-medium p-2">Location</th>
                    <th className="text-left font-medium p-2">Functions</th>
                    <th className="text-left font-medium p-2">Regulatory Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t">
                    <td className="p-2">PharmaCorp Site 1</td>
                    <td className="p-2">Boston, MA, USA</td>
                    <td className="p-2">
                      <ul className="list-disc list-inside">
                        <li>API Manufacturing</li>
                        <li>Quality Control</li>
                      </ul>
                    </td>
                    <td className="p-2">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                        FDA Approved
                      </span>
                    </td>
                  </tr>
                  <tr className="border-t">
                    <td className="p-2">PharmaCorp Site 2</td>
                    <td className="p-2">Research Triangle, NC, USA</td>
                    <td className="p-2">
                      <ul className="list-disc list-inside">
                        <li>Drug Product Manufacturing</li>
                        <li>Packaging</li>
                        <li>Quality Control</li>
                      </ul>
                    </td>
                    <td className="p-2">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                        FDA Approved
                      </span>
                    </td>
                  </tr>
                  <tr className="border-t">
                    <td className="p-2">PharmaCorp EU Site</td>
                    <td className="p-2">Dublin, Ireland</td>
                    <td className="p-2">
                      <ul className="list-disc list-inside">
                        <li>Drug Product Manufacturing</li>
                        <li>Packaging</li>
                        <li>Quality Control</li>
                      </ul>
                    </td>
                    <td className="p-2">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                        EMA Approved
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <div className="flex justify-between w-full">
          <Button variant="outline">
            <FileSearch className="h-4 w-4 mr-2" />
            View Batch Records
          </Button>
          <Button>
            <BookOpen className="h-4 w-4 mr-2" />
            Process Validation
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
