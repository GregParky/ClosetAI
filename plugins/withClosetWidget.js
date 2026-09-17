/**
 * Expo config plugin — adds the ClosetAI iOS widget extension.
 *
 * What it does:
 *  1. Adds the App Group entitlement to the main app so it can share
 *     UserDefaults with the widget.
 *  2. Copies the Swift widget source files from targets/closetai-widget/
 *     into ios/ClosetAIWidget/ during prebuild.
 *  3. Injects a full WidgetKit extension target into the Xcode project,
 *     including build phases, configurations, and the embed phase on the
 *     main target so Xcode bundles the extension into the .ipa.
 */

const {
  withXcodeProject,
  withEntitlementsPlist,
  withDangerousMod,
} = require('@expo/config-plugins');
const path = require('path');
const fs   = require('fs');

const APP_GROUP        = 'group.com.gregpark.closetai';
const WIDGET_NAME      = 'ClosetAIWidget';
const WIDGET_BUNDLE_ID = 'com.gregpark.closetai.widget';
const DEPLOY_TARGET    = '16.0'; // WidgetKit lock-screen support requires 16+

// ─── 1. App Group entitlement on the main app ─────────────────────────────────

function withMainAppGroup(config) {
  return withEntitlementsPlist(config, (mod) => {
    const key      = 'com.apple.security.application-groups';
    const existing = mod.modResults[key] ?? [];
    if (!existing.includes(APP_GROUP)) {
      mod.modResults[key] = [...existing, APP_GROUP];
    }
    return mod;
  });
}

// ─── 2. Copy Swift source files into ios/ClosetAIWidget/ ──────────────────────

function withWidgetSourceFiles(config) {
  return withDangerousMod(config, [
    'ios',
    (mod) => {
      const iosDir  = mod.modRequest.platformProjectRoot;
      const destDir = path.join(iosDir, WIDGET_NAME);
      const srcDir  = path.join(mod.modRequest.projectRoot, 'targets', 'closetai-widget');

      if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

      for (const file of [
        'ClosetAIWidget.swift',
        'ClosetAIWidgetBundle.swift',
        'Info.plist',
        'ClosetAIWidget.entitlements',
      ]) {
        const src = path.join(srcDir, file);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, path.join(destDir, file));
        }
      }
      return mod;
    },
  ]);
}

// ─── 3. Inject the widget target into the Xcode project ───────────────────────

function withWidgetXcodeTarget(config) {
  return withXcodeProject(config, (mod) => {
    const project = mod.modResults;
    const objects = project.hash.project.objects;

    // Idempotency guard
    const existingTargets = objects['PBXNativeTarget'] ?? {};
    if (Object.values(existingTargets).some((t) => t && t.name === WIDGET_NAME)) {
      return mod;
    }

    const g = () => project.generateUuid();

    // ── File references ──────────────────────────────────────────────────
    const refSwift1   = g(); // ClosetAIWidget.swift
    const refSwift2   = g(); // ClosetAIWidgetBundle.swift
    const refPlist    = g(); // Info.plist
    const refProduct  = g(); // ClosetAIWidget.appex (build product)

    // ── Build file entries (source files + embed product) ────────────────
    const bfSwift1  = g();
    const bfSwift2  = g();
    const bfEmbed   = g();

    // ── Build phases ─────────────────────────────────────────────────────
    const phSources    = g();
    const phFrameworks = g();
    const phResources  = g();
    const phEmbed      = g(); // added to main target, not widget

    // ── Configurations + list ────────────────────────────────────────────
    const cfgDebug   = g();
    const cfgRelease = g();
    const cfgList    = g();

    // ── Target + dependency plumbing ─────────────────────────────────────
    const widgetTargetId = g();
    const depProxyId     = g();
    const depId          = g();
    const widgetGroupId  = g();

    // ── PBXFileReference ─────────────────────────────────────────────────
    objects['PBXFileReference'] ??= {};
    Object.assign(objects['PBXFileReference'], {
      [refSwift1]: {
        isa: 'PBXFileReference',
        lastKnownFileType: 'sourcecode.swift',
        path: 'ClosetAIWidget.swift',
        sourceTree: '"<group>"',
      },
      [refSwift2]: {
        isa: 'PBXFileReference',
        lastKnownFileType: 'sourcecode.swift',
        path: 'ClosetAIWidgetBundle.swift',
        sourceTree: '"<group>"',
      },
      [refPlist]: {
        isa: 'PBXFileReference',
        lastKnownFileType: 'text.plist.xml',
        path: 'Info.plist',
        sourceTree: '"<group>"',
      },
      [refProduct]: {
        isa: 'PBXFileReference',
        explicitFileType: 'wrapper.app-extension',
        includeInIndex: '0',
        path: `${WIDGET_NAME}.appex`,
        sourceTree: 'BUILT_PRODUCTS_DIR',
      },
    });

    // ── PBXBuildFile ─────────────────────────────────────────────────────
    objects['PBXBuildFile'] ??= {};
    Object.assign(objects['PBXBuildFile'], {
      [bfSwift1]: { isa: 'PBXBuildFile', fileRef: refSwift1 },
      [bfSwift2]: { isa: 'PBXBuildFile', fileRef: refSwift2 },
      [bfEmbed]:  {
        isa: 'PBXBuildFile',
        fileRef: refProduct,
        settings: { ATTRIBUTES: ['RemoveHeadersOnCopy'] },
      },
    });

    // ── PBXGroup for widget folder ────────────────────────────────────────
    objects['PBXGroup'] ??= {};
    objects['PBXGroup'][widgetGroupId] = {
      isa: 'PBXGroup',
      children: [
        { value: refSwift1,  comment: 'ClosetAIWidget.swift' },
        { value: refSwift2,  comment: 'ClosetAIWidgetBundle.swift' },
        { value: refPlist,   comment: 'Info.plist' },
      ],
      name: WIDGET_NAME,
      path: WIDGET_NAME,
      sourceTree: '"<group>"',
    };

    // Add widget group to the project's main group
    const mainGroupId = getMainGroupId(objects);
    if (mainGroupId) {
      objects['PBXGroup'][mainGroupId].children ??= [];
      objects['PBXGroup'][mainGroupId].children.push({
        value: widgetGroupId, comment: WIDGET_NAME,
      });
    }

    // Add .appex product to the Products group
    const productsGroupId = getProductsGroupId(objects);
    if (productsGroupId) {
      objects['PBXGroup'][productsGroupId].children ??= [];
      objects['PBXGroup'][productsGroupId].children.push({
        value: refProduct, comment: `${WIDGET_NAME}.appex`,
      });
    }

    // ── Build phases (for the widget target) ─────────────────────────────
    objects['PBXSourcesBuildPhase'] ??= {};
    objects['PBXSourcesBuildPhase'][phSources] = {
      isa: 'PBXSourcesBuildPhase',
      buildActionMask: '2147483647',
      files: [
        { value: bfSwift1, comment: 'ClosetAIWidget.swift in Sources' },
        { value: bfSwift2, comment: 'ClosetAIWidgetBundle.swift in Sources' },
      ],
      runOnlyForDeploymentPostprocessing: '0',
    };

    objects['PBXFrameworksBuildPhase'] ??= {};
    objects['PBXFrameworksBuildPhase'][phFrameworks] = {
      isa: 'PBXFrameworksBuildPhase',
      buildActionMask: '2147483647',
      files: [],
      runOnlyForDeploymentPostprocessing: '0',
    };

    objects['PBXResourcesBuildPhase'] ??= {};
    objects['PBXResourcesBuildPhase'][phResources] = {
      isa: 'PBXResourcesBuildPhase',
      buildActionMask: '2147483647',
      files: [],
      runOnlyForDeploymentPostprocessing: '0',
    };

    // ── Build configurations ──────────────────────────────────────────────
    const sharedSettings = {
      ALWAYS_EMBED_SWIFT_STANDARD_LIBRARIES: 'NO',
      CODE_SIGN_ENTITLEMENTS: `"${WIDGET_NAME}/${WIDGET_NAME}.entitlements"`,
      CODE_SIGN_STYLE: 'Automatic',
      CURRENT_PROJECT_VERSION: '1',
      GENERATE_INFOPLIST_FILE: 'NO',
      INFOPLIST_FILE: `"${WIDGET_NAME}/Info.plist"`,
      IPHONEOS_DEPLOYMENT_TARGET: DEPLOY_TARGET,
      MARKETING_VERSION: '"1.0"',
      PRODUCT_BUNDLE_IDENTIFIER: `"${WIDGET_BUNDLE_ID}"`,
      PRODUCT_NAME: '"$(TARGET_NAME)"',
      SKIP_INSTALL: 'YES',
      SWIFT_VERSION: '"5.0"',
      TARGETED_DEVICE_FAMILY: '"1"',
    };

    objects['XCBuildConfiguration'] ??= {};
    Object.assign(objects['XCBuildConfiguration'], {
      [cfgDebug]: {
        isa: 'XCBuildConfiguration',
        buildSettings: {
          ...sharedSettings,
          DEBUG_INFORMATION_FORMAT: 'dwarf',
          MTL_ENABLE_DEBUG_INFO: 'INCLUDE_SOURCE',
          SWIFT_OPTIMIZATION_LEVEL: '"-Onone"',
        },
        name: 'Debug',
      },
      [cfgRelease]: {
        isa: 'XCBuildConfiguration',
        buildSettings: {
          ...sharedSettings,
          COPY_PHASE_STRIP: 'NO',
          DEBUG_INFORMATION_FORMAT: '"dwarf-with-dsym"',
          MTL_ENABLE_DEBUG_INFO: 'NO',
          SWIFT_OPTIMIZATION_LEVEL: '"-Owholemodule"',
          VALIDATE_PRODUCT: 'YES',
        },
        name: 'Release',
      },
    });

    // ── XCConfigurationList ───────────────────────────────────────────────
    objects['XCConfigurationList'] ??= {};
    objects['XCConfigurationList'][cfgList] = {
      isa: 'XCConfigurationList',
      buildConfigurations: [
        { value: cfgDebug,   comment: 'Debug' },
        { value: cfgRelease, comment: 'Release' },
      ],
      defaultConfigurationIsVisible: '0',
      defaultConfigurationName: 'Release',
    };

    // ── PBXNativeTarget ───────────────────────────────────────────────────
    objects['PBXNativeTarget'] ??= {};
    objects['PBXNativeTarget'][widgetTargetId] = {
      isa: 'PBXNativeTarget',
      buildConfigurationList: cfgList,
      buildPhases: [
        { value: phSources,    comment: 'Sources' },
        { value: phFrameworks, comment: 'Frameworks' },
        { value: phResources,  comment: 'Resources' },
      ],
      buildRules: [],
      dependencies: [],
      name: WIDGET_NAME,
      productName: `"${WIDGET_NAME}"`,
      productReference: refProduct,
      productType: '"com.apple.product-type.app-extension"',
    };

    // ── Register target in PBXProject ─────────────────────────────────────
    const projectSection = objects['PBXProject'] ?? {};
    const projectKey = Object.keys(projectSection).find((k) => !k.endsWith('_comment'));
    if (projectKey) {
      projectSection[projectKey].targets ??= [];
      projectSection[projectKey].targets.push({
        value: widgetTargetId, comment: WIDGET_NAME,
      });
    }

    // ── PBXContainerItemProxy + PBXTargetDependency ───────────────────────
    const projectId = projectKey ?? '';
    objects['PBXContainerItemProxy'] ??= {};
    objects['PBXContainerItemProxy'][depProxyId] = {
      isa: 'PBXContainerItemProxy',
      containerPortal: projectId,
      proxyType: '1',
      remoteGlobalIDString: widgetTargetId,
      remoteInfo: `"${WIDGET_NAME}"`,
    };

    objects['PBXTargetDependency'] ??= {};
    objects['PBXTargetDependency'][depId] = {
      isa: 'PBXTargetDependency',
      target: widgetTargetId,
      targetProxy: depProxyId,
    };

    // Add dependency to main app target
    const mainTargetId = getMainTargetId(objects);
    if (mainTargetId) {
      const mainTarget = objects['PBXNativeTarget'][mainTargetId];
      mainTarget.dependencies ??= [];
      mainTarget.dependencies.push({ value: depId, comment: WIDGET_NAME });

      // ── Embed App Extensions phase on the main target ─────────────────
      const copyPhases = objects['PBXCopyFilesBuildPhase'] ?? {};
      const existingEmbedId = mainTarget.buildPhases?.find((ph) => {
        const p = copyPhases[ph.value];
        return p && p.dstSubfolderSpec === '13';
      })?.value;

      objects['PBXCopyFilesBuildPhase'] ??= {};

      if (existingEmbedId) {
        // Append our product to an existing embed phase
        copyPhases[existingEmbedId].files ??= [];
        copyPhases[existingEmbedId].files.push({
          value: bfEmbed,
          comment: `${WIDGET_NAME}.appex in Embed App Extensions`,
        });
      } else {
        // Create a fresh embed phase
        objects['PBXCopyFilesBuildPhase'][phEmbed] = {
          isa: 'PBXCopyFilesBuildPhase',
          buildActionMask: '2147483647',
          dstPath: '""',
          dstSubfolderSpec: '13',
          files: [
            { value: bfEmbed, comment: `${WIDGET_NAME}.appex in Embed App Extensions` },
          ],
          name: '"Embed App Extensions"',
          runOnlyForDeploymentPostprocessing: '0',
        };
        mainTarget.buildPhases ??= [];
        mainTarget.buildPhases.push({
          value: phEmbed, comment: 'Embed App Extensions',
        });
      }
    }

    return mod;
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMainGroupId(objects) {
  const proj = objects['PBXProject'] ?? {};
  for (const key of Object.keys(proj)) {
    if (!key.endsWith('_comment') && proj[key].mainGroup) {
      return proj[key].mainGroup;
    }
  }
  return null;
}

function getProductsGroupId(objects) {
  const groups = objects['PBXGroup'] ?? {};
  return Object.keys(groups).find(
    (k) => !k.endsWith('_comment') && groups[k].name === 'Products'
  ) ?? null;
}

function getMainTargetId(objects) {
  const targets = objects['PBXNativeTarget'] ?? {};
  return Object.keys(targets).find((k) => {
    const t = targets[k];
    return (
      !k.endsWith('_comment') &&
      t &&
      t.name !== WIDGET_NAME &&
      t.productType === '"com.apple.product-type.application"'
    );
  }) ?? null;
}

// ─── Export ───────────────────────────────────────────────────────────────────

module.exports = function withClosetWidget(config) {
  config = withMainAppGroup(config);
  config = withWidgetSourceFiles(config);
  config = withWidgetXcodeTarget(config);
  return config;
};
