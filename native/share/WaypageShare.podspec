require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name = 'WaypageShare'
  s.version = package['version']
  s.summary = package['description']
  s.license = { :type => 'Private', :text => 'Part of Waypage.' }
  s.homepage = 'https://github.com/danielnoam/waypage'
  s.author = 'Waypage'
  s.source = { :git => 'https://github.com/danielnoam/waypage.git' }
  s.source_files = 'ios/Sources/**/*.swift', 'ios/Shared/**/*.swift'
  s.ios.deployment_target = '15.0'
  # Translation is iOS 17.4+: weak, so the app still opens on older iOS.
  s.weak_frameworks = 'Translation'
  s.dependency 'Capacitor'
  s.swift_version = '5.1'
end
