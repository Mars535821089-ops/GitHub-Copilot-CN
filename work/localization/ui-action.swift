import AppKit
import ApplicationServices
func val(_ e:AXUIElement,_ key:String)->CFTypeRef?{var x:CFTypeRef?;AXUIElementCopyAttributeValue(e,key as CFString,&x);return x}
let args=Array(CommandLine.arguments.dropFirst());let target=args.first ?? "";let mode=args.count>1 ? args[1]:"press"
guard let app=NSWorkspace.shared.runningApplications.first(where:{$0.bundleIdentifier=="com.github.githubapp"})else{exit(2)}
app.activate(options:[.activateIgnoringOtherApps]);Thread.sleep(forTimeInterval:0.35)
let root=AXUIElementCreateApplication(app.processIdentifier);var count=0
func find(_ e:AXUIElement,_ depth:Int)->Bool{if depth>35||count>6000{return false};count+=1
let role=val(e,kAXRoleAttribute) as? String ?? "";let title=val(e,kAXTitleAttribute) as? String ?? "";let desc=val(e,kAXDescriptionAttribute) as? String ?? ""
if ["AXButton","AXPopUpButton","AXRadioButton","AXCheckBox","AXMenuItem","AXMenuBarItem","AXLink"].contains(role)&&(title==target||desc==target){
 let r=AXUIElementPerformAction(e,kAXPressAction as CFString);print("press",role,title,desc,"result",r.rawValue);return r == .success}
if let kids=val(e,kAXChildrenAttribute) as? [AXUIElement]{for child in kids{if find(child,depth+1){return true}}};return false}
if !find(root,0){print("NOT_FOUND",target);exit(3)}
