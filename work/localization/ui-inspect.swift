import AppKit
import ApplicationServices
import CoreGraphics
func value(_ el: AXUIElement,_ key:String)->CFTypeRef?{var v:CFTypeRef?;AXUIElementCopyAttributeValue(el,key as CFString,&v);return v}
let apps=NSWorkspace.shared.runningApplications.filter{$0.bundleIdentifier=="com.github.githubapp"}
if CommandLine.arguments.contains("windows"){
 let windows=CGWindowListCopyWindowInfo([.optionOnScreenOnly,.excludeDesktopElements],kCGNullWindowID) as? [[String:Any]] ?? []
 for w in windows{if apps.contains(where:{$0.processIdentifier==w[kCGWindowOwnerPID as String] as? pid_t}){print(w)}}
 exit(0)
}
var output:[[String:Any]]=[]
func scan(_ e:AXUIElement,_ depth:Int){if depth>35||output.count>6000{return};var row:[String:Any]=[:]
for k in [kAXRoleAttribute,kAXTitleAttribute,kAXDescriptionAttribute,kAXValueAttribute,kAXIdentifierAttribute]{if let v=value(e,k){let s=String(describing:v);if !s.isEmpty&&s != "0"{row[k]=s.prefix(500).description}}}
if !row.isEmpty{row["depth"]=depth;output.append(row)}
if let children=value(e,kAXChildrenAttribute) as? [AXUIElement]{for c in children{scan(c,depth+1)}}
}
for app in apps{app.activate(options:[.activateIgnoringOtherApps]);Thread.sleep(forTimeInterval:0.35);scan(AXUIElementCreateApplication(app.processIdentifier),0)}
let data=try JSONSerialization.data(withJSONObject:output,options:[.prettyPrinted,.sortedKeys]);print(String(data:data,encoding:.utf8)!)
