/**
 * generate-template.ts
 *
 * Generates templates/blank-stamp-track.als — a minimal Ableton Live 11 project
 * containing exactly one empty MIDI track named "Vocals +LYRICS".
 *
 * .als files are gzip-compressed XML. This script builds the XML tree using
 * fast-xml-parser's XMLBuilder, gzips it with Node's zlib.gzipSync, and
 * writes to templates/blank-stamp-track.als.
 *
 * The output is deterministic (no timestamps or UUIDs), so running the script
 * twice produces byte-identical files.
 */

import { XMLBuilder } from 'fast-xml-parser';
import { XMLParser } from 'fast-xml-parser';
import { gzipSync, gunzipSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = resolve(__dirname, '..', 'templates', 'blank-stamp-track.als');

const TRACK_NAME = 'Vocals +LYRICS';

// ---------------------------------------------------------------------------
// Build XML tree
// ---------------------------------------------------------------------------

/**
 * Minimal Ableton 11 LiveSet structure.
 * Attribute keys use the '@_' prefix required by fast-xml-parser's XMLBuilder.
 */
const liveSet = {
  '?xml': {
    '@_version': '1.0',
    '@_encoding': 'UTF-8',
  },
  Ableton: {
    '@_MajorVersion': '5',
    '@_MinorVersion': '11.0.11202',
    '@_SchemaChangeCount': '3',
    '@_Creator': 'Ableton Live 11.3',
    '@_Revision': '',
    LiveSet: {
      NextPointeeId: { '@_Value': '10' },
      OverwriteProtectionNumber: { '@_Value': '2816' },
      LomId: { '@_Value': '0' },
      Tracks: {
        MidiTrack: {
          '@_Id': '0',
          LomId: { '@_Value': '0' },
          IsContentSelected: { '@_Value': 'false' },
          PreferredInputType: { '@_Value': '0' },
          PreferredInputSubType: { '@_Value': '0' },
          PreferredOutputType: { '@_Value': '0' },
          PreferredOutputSubType: { '@_Value': '0' },
          Name: {
            LomId: { '@_Value': '0' },
            UserName: { '@_Value': '' },
            Annotation: { '@_Value': '' },
            EffectiveName: { '@_Value': TRACK_NAME },
            IsContentSelected: { '@_Value': 'false' },
            Memo: { '@_Value': '' },
          },
          Color: { '@_Value': '0' },
          AutomationEnvelopes: {
            Envelopes: '',
          },
          TrackGroupId: { '@_Value': '-1' },
          TrackUnfolded: { '@_Value': 'false' },
          DevicesListWrapper: { '@_LomId': '0' },
          ClipSlotsListWrapper: { '@_LomId': '0' },
          ViewData: { '@_Value': '{}' },
          TakeLanes: {
            TakeLaneExtendedStates: '',
          },
          LinkedTrackGroupId: { '@_Value': '-1' },
          DeviceChain: {
            AutomationLanes: {
              AutomationLanes: '',
              IsSorterOpen: { '@_Value': 'false' },
            },
            ClipEnvelopeChooserViewState: {
              SelectedDevice: { '@_Value': '0' },
              SelectedEnvelope: { '@_Value': '0' },
              PreferModulationVisible: { '@_Value': 'false' },
            },
            AudioInputRouting: {
              Target: { '@_Value': 'AudioIn/External/S0' },
              UpperDisplayString: { '@_Value': 'Ext. In' },
              LowerDisplayString: { '@_Value': '1' },
              MpeSettings: {
                Zone: {
                  Start: { '@_Value': '0' },
                  End: { '@_Value': '15' },
                },
                NumNotesPerChannel: { '@_Value': '1' },
                ReleaseMode: { '@_Value': '0' },
              },
            },
            MidiInputRouting: {
              Target: { '@_Value': 'MidiIn/External.All/-1' },
              UpperDisplayString: { '@_Value': 'Ext: All Ins' },
              LowerDisplayString: { '@_Value': '' },
              MpeSettings: {
                Zone: {
                  Start: { '@_Value': '0' },
                  End: { '@_Value': '15' },
                },
                NumNotesPerChannel: { '@_Value': '1' },
                ReleaseMode: { '@_Value': '0' },
              },
            },
            AudioOutputRouting: {
              Target: { '@_Value': 'AudioOut/Master' },
              UpperDisplayString: { '@_Value': 'Master' },
              LowerDisplayString: { '@_Value': '' },
              MpeSettings: {
                Zone: {
                  Start: { '@_Value': '0' },
                  End: { '@_Value': '15' },
                },
                NumNotesPerChannel: { '@_Value': '1' },
                ReleaseMode: { '@_Value': '0' },
              },
            },
            MidiOutputRouting: {
              Target: { '@_Value': 'MidiOut/None' },
              UpperDisplayString: { '@_Value': 'None' },
              LowerDisplayString: { '@_Value': '' },
              MpeSettings: {
                Zone: {
                  Start: { '@_Value': '0' },
                  End: { '@_Value': '15' },
                },
                NumNotesPerChannel: { '@_Value': '1' },
                ReleaseMode: { '@_Value': '0' },
              },
            },
            Mixer: {
              LomId: { '@_Value': '0' },
              LomIdView: { '@_Value': '0' },
              IsExpanded: { '@_Value': 'true' },
              On: {
                LomId: { '@_Value': '0' },
                Manual: { '@_Value': 'true' },
                AutomationTarget: { '@_Id': '1' },
                ModulationTarget: { '@_Id': '2' },
              },
              ModulationSourceCount: { '@_Value': '0' },
              ParametersListWrapper: { '@_LomId': '0' },
              Pointee: { '@_Id': '3' },
              LastSelectedTimeableIndex: { '@_Value': '0' },
              LastSelectedClipEnvelopeIndex: { '@_Value': '0' },
              LastPresetRef: {
                AbletonDefaultPresetRef: {
                  '@_Id': '1',
                  FileRef: {
                    RelativePathType: { '@_Value': '3' },
                    RelativePath: { '@_Value': '' },
                    Path: { '@_Value': '' },
                    Type: { '@_Value': '0' },
                    LivePackName: { '@_Value': '' },
                    LivePackId: { '@_Value': '' },
                    OriginalFileSize: { '@_Value': '0' },
                    OriginalCrc: { '@_Value': '0' },
                  },
                  DeviceId: {
                    Bundle: {
                      '@_Key': 'Ableton:AbletonMixerDevice',
                    },
                  },
                },
              },
              LockedScripts: '',
              IsFolded: { '@_Value': 'false' },
              ShouldShowPresetName: { '@_Value': 'false' },
              UserName: { '@_Value': '' },
              Annotation: { '@_Value': '' },
              SourceContext: {
                SourceContext: '',
              },
              Sends: '',
              Speaker: {
                LomId: { '@_Value': '0' },
                Manual: { '@_Value': 'true' },
                AutomationTarget: { '@_Id': '4' },
                ModulationTarget: { '@_Id': '5' },
              },
              SoloSink: { '@_Value': 'false' },
              PanMode: { '@_Value': '0' },
              Pan: {
                LomId: { '@_Value': '0' },
                Manual: { '@_Value': '0' },
                MidiControllerRange: {
                  Min: { '@_Value': '-1' },
                  Max: { '@_Value': '1' },
                },
                AutomationTarget: { '@_Id': '6' },
                ModulationTarget: { '@_Id': '7' },
              },
              SplitStereoPanL: {
                LomId: { '@_Value': '0' },
                Manual: { '@_Value': '-1' },
                MidiControllerRange: {
                  Min: { '@_Value': '-1' },
                  Max: { '@_Value': '1' },
                },
                AutomationTarget: { '@_Id': '8' },
                ModulationTarget: { '@_Id': '9' },
              },
              SplitStereoPanR: {
                LomId: { '@_Value': '0' },
                Manual: { '@_Value': '1' },
                MidiControllerRange: {
                  Min: { '@_Value': '-1' },
                  Max: { '@_Value': '1' },
                },
                AutomationTarget: { '@_Id': '10' },
                ModulationTarget: { '@_Id': '11' },
              },
              Volume: {
                LomId: { '@_Value': '0' },
                Manual: { '@_Value': '1' },
                MidiControllerRange: {
                  Min: { '@_Value': '0.0003162277571' },
                  Max: { '@_Value': '1.99526238' },
                },
                AutomationTarget: { '@_Id': '12' },
                ModulationTarget: { '@_Id': '13' },
              },
              ViewStateSesstionTrackWidth: { '@_Value': '93' },
              CrossFadeState: {
                LomId: { '@_Value': '0' },
                Manual: { '@_Value': '0' },
                AutomationTarget: { '@_Id': '14' },
              },
              SendsListWrapper: { '@_LomId': '0' },
            },
            MainSequencer: {
              LomId: { '@_Value': '0' },
              LomIdView: { '@_Value': '0' },
              IsExpanded: { '@_Value': 'true' },
              On: {
                LomId: { '@_Value': '0' },
                Manual: { '@_Value': 'true' },
                AutomationTarget: { '@_Id': '15' },
                ModulationTarget: { '@_Id': '16' },
              },
              ModulationSourceCount: { '@_Value': '0' },
              ParametersListWrapper: { '@_LomId': '0' },
              Pointee: { '@_Id': '17' },
              LastSelectedTimeableIndex: { '@_Value': '0' },
              LastSelectedClipEnvelopeIndex: { '@_Value': '0' },
              LastPresetRef: {
                AbletonDefaultPresetRef: {
                  '@_Id': '2',
                  FileRef: {
                    RelativePathType: { '@_Value': '3' },
                    RelativePath: { '@_Value': '' },
                    Path: { '@_Value': '' },
                    Type: { '@_Value': '0' },
                    LivePackName: { '@_Value': '' },
                    LivePackId: { '@_Value': '' },
                    OriginalFileSize: { '@_Value': '0' },
                    OriginalCrc: { '@_Value': '0' },
                  },
                  DeviceId: {
                    Bundle: {
                      '@_Key': 'Ableton:MidiInstrument',
                    },
                  },
                },
              },
              LockedScripts: '',
              IsFolded: { '@_Value': 'false' },
              ShouldShowPresetName: { '@_Value': 'false' },
              UserName: { '@_Value': '' },
              Annotation: { '@_Value': '' },
              SourceContext: {
                SourceContext: '',
              },
              BeatGrid: {
                FixedNumerator: { '@_Value': '4' },
                FixedDenominator: { '@_Value': '4' },
                DrawMode: { '@_Value': '0' },
              },
              RecordingContext: {
                CurrentCTEventIndex: { '@_Value': '0' },
                CountInDuration: { '@_Value': '0' },
              },
              ClipSlotList: {
                ClipSlot: [
                  {
                    '@_Id': '0',
                    LomId: { '@_Value': '0' },
                    ClipSlot: {
                      Value: '',
                    },
                    HasStop: { '@_Value': 'true' },
                    NeedRefreeze: { '@_Value': 'false' },
                  },
                  {
                    '@_Id': '1',
                    LomId: { '@_Value': '0' },
                    ClipSlot: {
                      Value: '',
                    },
                    HasStop: { '@_Value': 'true' },
                    NeedRefreeze: { '@_Value': 'false' },
                  },
                ],
              },
              MonitoringEnum: { '@_Value': '1' },
              InstrumentChain: '',
              InstrumentBranchPresetRef: {
                AbletonDefaultPresetRef: {
                  '@_Id': '3',
                  FileRef: {
                    RelativePathType: { '@_Value': '3' },
                    RelativePath: { '@_Value': '' },
                    Path: { '@_Value': '' },
                    Type: { '@_Value': '0' },
                    LivePackName: { '@_Value': '' },
                    LivePackId: { '@_Value': '' },
                    OriginalFileSize: { '@_Value': '0' },
                    OriginalCrc: { '@_Value': '0' },
                  },
                  DeviceId: {
                    Bundle: {
                      '@_Key': 'Ableton:MidiInstrument',
                    },
                  },
                },
              },
              FreezeSequencer: {
                LomId: { '@_Value': '0' },
                LomIdView: { '@_Value': '0' },
                IsExpanded: { '@_Value': 'true' },
                On: {
                  LomId: { '@_Value': '0' },
                  Manual: { '@_Value': 'true' },
                  AutomationTarget: { '@_Id': '18' },
                  ModulationTarget: { '@_Id': '19' },
                },
                ModulationSourceCount: { '@_Value': '0' },
                ParametersListWrapper: { '@_LomId': '0' },
                Pointee: { '@_Id': '20' },
                LastSelectedTimeableIndex: { '@_Value': '0' },
                LastSelectedClipEnvelopeIndex: { '@_Value': '0' },
                BeatGrid: {
                  FixedNumerator: { '@_Value': '4' },
                  FixedDenominator: { '@_Value': '4' },
                  DrawMode: { '@_Value': '0' },
                },
                RecordingContext: {
                  CurrentCTEventIndex: { '@_Value': '0' },
                  CountInDuration: { '@_Value': '0' },
                },
                ClipSlotList: {
                  ClipSlot: [
                    {
                      '@_Id': '0',
                      LomId: { '@_Value': '0' },
                      ClipSlot: { Value: '' },
                      HasStop: { '@_Value': 'true' },
                      NeedRefreeze: { '@_Value': 'false' },
                    },
                    {
                      '@_Id': '1',
                      LomId: { '@_Value': '0' },
                      ClipSlot: { Value: '' },
                      HasStop: { '@_Value': 'true' },
                      NeedRefreeze: { '@_Value': 'false' },
                    },
                  ],
                },
                MonitoringEnum: { '@_Value': '1' },
                InstrumentChain: '',
                Sample: '',
                VolumeModulationTarget: { '@_Id': '21' },
                TranspositionModulationTarget: { '@_Id': '22' },
                GrainSizeModulationTarget: { '@_Id': '23' },
                FluxModulationTarget: { '@_Id': '24' },
                SampleOffsetModulationTarget: { '@_Id': '25' },
                PitchViewScrollPosition: { '@_Value': '-1073741824' },
                SampleOffsetModulationScrollPosition: { '@_Value': '-1073741824' },
              },
              PitchViewScrollPosition: { '@_Value': '-1073741824' },
              SampleOffsetModulationScrollPosition: { '@_Value': '-1073741824' },
            },
            FreezeSequencer: '',
            Track: {
              '@_Id': '0',
            },
          },
          NoteEditorFoldInZoom: { '@_Value': '-1' },
          NoteEditorFoldInScroll: { '@_Value': '0' },
          NoteEditorFoldOutZoom: { '@_Value': '507' },
          NoteEditorFoldOutScroll: { '@_Value': '-1' },
          NoteEditorFoldScaleZoom: { '@_Value': '-1' },
          NoteEditorFoldScaleScroll: { '@_Value': '0' },
          MidiCCInDeviceChain: { '@_Value': 'false' },
          Visible: { '@_Value': 'true' },
          IsFrozen: { '@_Value': 'false' },
          ArrangerAutomation: {
            Events: '',
            AutomationTransformViewState: {
              IsTransformPending: { '@_Value': 'false' },
              TimeAndValueTransforms: '',
            },
          },
        },
      },
      Transport: {
        PhaseNudgeTempo: { '@_Value': '10' },
        LoopOn: { '@_Value': 'false' },
        LoopStart: { '@_Value': '0' },
        LoopLength: { '@_Value': '16' },
        LoopIsSongStart: { '@_Value': 'false' },
        CurrentTime: { '@_Value': '0' },
        PunchIn: { '@_Value': 'false' },
        PunchOut: { '@_Value': 'false' },
        MetronomeTickDuration: { '@_Value': '0' },
        DrawMode: { '@_Value': 'false' },
      },
      SongMasterValues: {
        SessionAutomationRecording: { '@_Value': 'false' },
      },
      GlobalQuantisation: { '@_Value': '4' },
      AutoQuantisation: { '@_Value': '0' },
      Grid: {
        FixedNumerator: { '@_Value': '1' },
        FixedDenominator: { '@_Value': '16' },
        GridIntervalPixel: { '@_Value': '20' },
        Ntoles: { '@_Value': '2' },
        SnapToGrid: { '@_Value': 'true' },
        Fixed: { '@_Value': 'false' },
      },
      ScaleInformation: {
        RootNote: { '@_Value': '0' },
        Name: { '@_Value': '' },
      },
      InKey: { '@_Value': 'false' },
      SmpteFormat: { '@_Value': '0' },
      TimeSelection: {
        AnchorTime: { '@_Value': '0' },
        OtherTime: { '@_Value': '0' },
      },
      Sequencer: {
        ViewData: { '@_Value': '{}' },
      },
      ControlSurfaces: '',
      MasterTrack: {
        LomId: { '@_Value': '0' },
        IsContentSelected: { '@_Value': 'false' },
        PreferredInputType: { '@_Value': '0' },
        PreferredInputSubType: { '@_Value': '0' },
        PreferredOutputType: { '@_Value': '0' },
        PreferredOutputSubType: { '@_Value': '0' },
        Name: {
          LomId: { '@_Value': '0' },
          UserName: { '@_Value': '' },
          Annotation: { '@_Value': '' },
          EffectiveName: { '@_Value': 'Master' },
          IsContentSelected: { '@_Value': 'false' },
          Memo: { '@_Value': '' },
        },
        Color: { '@_Value': '12' },
        AutomationEnvelopes: {
          Envelopes: '',
        },
        TrackGroupId: { '@_Value': '-1' },
        TrackUnfolded: { '@_Value': 'false' },
        DevicesListWrapper: { '@_LomId': '0' },
        ClipSlotsListWrapper: { '@_LomId': '0' },
        ViewData: { '@_Value': '{}' },
        TakeLanes: {
          TakeLaneExtendedStates: '',
        },
        LinkedTrackGroupId: { '@_Value': '-1' },
        DeviceChain: {
          AutomationLanes: {
            AutomationLanes: '',
            IsSorterOpen: { '@_Value': 'false' },
          },
          ClipEnvelopeChooserViewState: {
            SelectedDevice: { '@_Value': '0' },
            SelectedEnvelope: { '@_Value': '0' },
            PreferModulationVisible: { '@_Value': 'false' },
          },
          AudioInputRouting: {
            Target: { '@_Value': 'AudioIn/External/S0' },
            UpperDisplayString: { '@_Value': 'Ext. In' },
            LowerDisplayString: { '@_Value': '1' },
            MpeSettings: {
              Zone: {
                Start: { '@_Value': '0' },
                End: { '@_Value': '15' },
              },
              NumNotesPerChannel: { '@_Value': '1' },
              ReleaseMode: { '@_Value': '0' },
            },
          },
          MidiInputRouting: {
            Target: { '@_Value': 'MidiIn/External.All/-1' },
            UpperDisplayString: { '@_Value': 'Ext: All Ins' },
            LowerDisplayString: { '@_Value': '' },
            MpeSettings: {
              Zone: {
                Start: { '@_Value': '0' },
                End: { '@_Value': '15' },
              },
              NumNotesPerChannel: { '@_Value': '1' },
              ReleaseMode: { '@_Value': '0' },
            },
          },
          AudioOutputRouting: {
            Target: { '@_Value': 'AudioOut/Master' },
            UpperDisplayString: { '@_Value': 'Master' },
            LowerDisplayString: { '@_Value': '' },
            MpeSettings: {
              Zone: {
                Start: { '@_Value': '0' },
                End: { '@_Value': '15' },
              },
              NumNotesPerChannel: { '@_Value': '1' },
              ReleaseMode: { '@_Value': '0' },
            },
          },
          MidiOutputRouting: {
            Target: { '@_Value': 'MidiOut/None' },
            UpperDisplayString: { '@_Value': 'None' },
            LowerDisplayString: { '@_Value': '' },
            MpeSettings: {
              Zone: {
                Start: { '@_Value': '0' },
                End: { '@_Value': '15' },
              },
              NumNotesPerChannel: { '@_Value': '1' },
              ReleaseMode: { '@_Value': '0' },
            },
          },
          Mixer: {
            LomId: { '@_Value': '0' },
            LomIdView: { '@_Value': '0' },
            IsExpanded: { '@_Value': 'true' },
            On: {
              LomId: { '@_Value': '0' },
              Manual: { '@_Value': 'true' },
              AutomationTarget: { '@_Id': '30' },
              ModulationTarget: { '@_Id': '31' },
            },
            ModulationSourceCount: { '@_Value': '0' },
            ParametersListWrapper: { '@_LomId': '0' },
            Pointee: { '@_Id': '32' },
            LastSelectedTimeableIndex: { '@_Value': '0' },
            LastSelectedClipEnvelopeIndex: { '@_Value': '0' },
            LastPresetRef: {
              AbletonDefaultPresetRef: {
                '@_Id': '4',
                FileRef: {
                  RelativePathType: { '@_Value': '3' },
                  RelativePath: { '@_Value': '' },
                  Path: { '@_Value': '' },
                  Type: { '@_Value': '0' },
                  LivePackName: { '@_Value': '' },
                  LivePackId: { '@_Value': '' },
                  OriginalFileSize: { '@_Value': '0' },
                  OriginalCrc: { '@_Value': '0' },
                },
                DeviceId: {
                  Bundle: {
                    '@_Key': 'Ableton:AbletonMixerDevice',
                  },
                },
              },
            },
            LockedScripts: '',
            IsFolded: { '@_Value': 'false' },
            ShouldShowPresetName: { '@_Value': 'false' },
            UserName: { '@_Value': '' },
            Annotation: { '@_Value': '' },
            SourceContext: {
              SourceContext: '',
            },
            Sends: '',
            Speaker: {
              LomId: { '@_Value': '0' },
              Manual: { '@_Value': 'true' },
              AutomationTarget: { '@_Id': '33' },
              ModulationTarget: { '@_Id': '34' },
            },
            SoloSink: { '@_Value': 'false' },
            PanMode: { '@_Value': '0' },
            Pan: {
              LomId: { '@_Value': '0' },
              Manual: { '@_Value': '0' },
              MidiControllerRange: {
                Min: { '@_Value': '-1' },
                Max: { '@_Value': '1' },
              },
              AutomationTarget: { '@_Id': '35' },
              ModulationTarget: { '@_Id': '36' },
            },
            SplitStereoPanL: {
              LomId: { '@_Value': '0' },
              Manual: { '@_Value': '-1' },
              MidiControllerRange: {
                Min: { '@_Value': '-1' },
                Max: { '@_Value': '1' },
              },
              AutomationTarget: { '@_Id': '37' },
              ModulationTarget: { '@_Id': '38' },
            },
            SplitStereoPanR: {
              LomId: { '@_Value': '0' },
              Manual: { '@_Value': '1' },
              MidiControllerRange: {
                Min: { '@_Value': '-1' },
                Max: { '@_Value': '1' },
              },
              AutomationTarget: { '@_Id': '39' },
              ModulationTarget: { '@_Id': '40' },
            },
            Volume: {
              LomId: { '@_Value': '0' },
              Manual: { '@_Value': '1' },
              MidiControllerRange: {
                Min: { '@_Value': '0.0003162277571' },
                Max: { '@_Value': '1.99526238' },
              },
              AutomationTarget: { '@_Id': '41' },
              ModulationTarget: { '@_Id': '42' },
            },
            ViewStateSesstionTrackWidth: { '@_Value': '93' },
            CrossFadeState: {
              LomId: { '@_Value': '0' },
              Manual: { '@_Value': '0' },
              AutomationTarget: { '@_Id': '43' },
            },
            SendsListWrapper: { '@_LomId': '0' },
            Tempo: {
              LomId: { '@_Value': '0' },
              Manual: { '@_Value': '120' },
              MidiControllerRange: {
                Min: { '@_Value': '60' },
                Max: { '@_Value': '200' },
              },
              AutomationTarget: { '@_Id': '44' },
              ModulationTarget: { '@_Id': '45' },
            },
            TimeSignature: {
              TimeSignatures: {
                RemoteableTimeSignature: {
                  '@_Id': '0',
                  Numerator: { '@_Value': '4' },
                  Denominator: { '@_Value': '4' },
                  Time: { '@_Value': '0' },
                },
              },
            },
            KeyTracks: '',
            SessionAutomationRecording: { '@_Value': 'false' },
          },
        },
        Visible: { '@_Value': 'true' },
        ArrangerAutomation: {
          Events: '',
          AutomationTransformViewState: {
            IsTransformPending: { '@_Value': 'false' },
            TimeAndValueTransforms: '',
          },
        },
      },
      PreHearTrack: {
        LomId: { '@_Value': '0' },
        IsContentSelected: { '@_Value': 'false' },
        PreferredInputType: { '@_Value': '0' },
        PreferredInputSubType: { '@_Value': '0' },
        PreferredOutputType: { '@_Value': '0' },
        PreferredOutputSubType: { '@_Value': '0' },
        Name: {
          LomId: { '@_Value': '0' },
          UserName: { '@_Value': '' },
          Annotation: { '@_Value': '' },
          EffectiveName: { '@_Value': 'Preview' },
          IsContentSelected: { '@_Value': 'false' },
          Memo: { '@_Value': '' },
        },
        Color: { '@_Value': '0' },
        AutomationEnvelopes: {
          Envelopes: '',
        },
        TrackGroupId: { '@_Value': '-1' },
        TrackUnfolded: { '@_Value': 'false' },
        DevicesListWrapper: { '@_LomId': '0' },
        ClipSlotsListWrapper: { '@_LomId': '0' },
        ViewData: { '@_Value': '{}' },
        TakeLanes: {
          TakeLaneExtendedStates: '',
        },
        LinkedTrackGroupId: { '@_Value': '-1' },
        Visible: { '@_Value': 'true' },
      },
      SendsPre: { '@_Value': 'false' },
      Scenes: {
        Scene: [
          {
            '@_Id': '0',
            Value: { '@_Value': '' },
            Name: { '@_Value': '' },
            Annotation: { '@_Value': '' },
            Color: { '@_Value': '-1' },
            Tempo: { '@_Value': '120' },
            IsTempoEnabled: { '@_Value': 'false' },
            TimeSignatureId: { '@_Value': '201' },
            IsTimeSignatureEnabled: { '@_Value': 'false' },
            LomId: { '@_Value': '0' },
            ClipSlotsListWrapper: { '@_LomId': '0' },
          },
          {
            '@_Id': '1',
            Value: { '@_Value': '' },
            Name: { '@_Value': '' },
            Annotation: { '@_Value': '' },
            Color: { '@_Value': '-1' },
            Tempo: { '@_Value': '120' },
            IsTempoEnabled: { '@_Value': 'false' },
            TimeSignatureId: { '@_Value': '201' },
            IsTimeSignatureEnabled: { '@_Value': 'false' },
            LomId: { '@_Value': '0' },
            ClipSlotsListWrapper: { '@_LomId': '0' },
          },
        ],
      },
      CrossFade: { '@_Value': '0' },
      AutoColorPickerForPlayerAndGroupTracks: {
        NextColorIndex: { '@_Value': '0' },
      },
      ContentLanes: '',
      ViewStates: {
        SessionIO: { '@_Value': '0' },
        SessionSends: { '@_Value': '0' },
        SessionReturns: { '@_Value': '1' },
        SessionMixer: { '@_Value': '1' },
        SessionTrackDelay: { '@_Value': '0' },
        SessionCrossFade: { '@_Value': '0' },
        SessionShowOverView: { '@_Value': '0' },
        ArrangerIO: { '@_Value': '0' },
        ArrangerReturns: { '@_Value': '1' },
        ArrangerMixer: { '@_Value': '1' },
        ArrangerTrackDelay: { '@_Value': '0' },
        ArrangerShowOverView: { '@_Value': '0' },
      },
      MidiBussRouting: '',
    },
  },
};

// ---------------------------------------------------------------------------
// Build, gzip, write
// ---------------------------------------------------------------------------

const builder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  format: true,
  indentBy: '\t',
  suppressEmptyNode: false,
});

// Build XML string
const xmlDeclaration = '<?xml version="1.0" encoding="UTF-8"?>\n';
// Remove the ?xml processing instruction key — XMLBuilder doesn't handle it;
// we prepend the declaration manually instead.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { '?xml': _xmlDecl, ...rest } = liveSet;
const xmlBody = builder.build(rest);
const xml = xmlDeclaration + xmlBody;

// Gzip with level 9, no timestamps (mtime=0 ensures determinism)
const gzipped = gzipSync(Buffer.from(xml, 'utf-8'), {
  level: 9,
  // memLevel and strategy defaults are fine; mtime is not exposed in Node's zlib options
  // but the output is still deterministic because input is deterministic
});

// Write output
mkdirSync(resolve(__dirname, '..', 'templates'), { recursive: true });
writeFileSync(OUTPUT_PATH, gzipped);
console.log(`Written: ${OUTPUT_PATH} (${gzipped.length} bytes)`);

// ---------------------------------------------------------------------------
// Verify: gunzip → parse → assert MidiTrack with correct name
// ---------------------------------------------------------------------------

const roundTrip = gunzipSync(gzipped).toString('utf-8');
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
});
const parsed = parser.parse(roundTrip);

// Navigate to MidiTrack
const tracks = parsed?.Ableton?.LiveSet?.Tracks;
if (!tracks) {
  console.error('VERIFY FAILED: no Tracks element in parsed XML');
  process.exit(1);
}

const midiTrack = tracks.MidiTrack;
const midiTracks = Array.isArray(midiTrack) ? midiTrack : [midiTrack];

if (midiTracks.length !== 1) {
  console.error(`VERIFY FAILED: expected 1 MidiTrack, found ${midiTracks.length}`);
  process.exit(1);
}

const effectiveName = midiTracks[0]?.Name?.EffectiveName?.['@_Value'];
if (effectiveName !== TRACK_NAME) {
  console.error(`VERIFY FAILED: expected track name "${TRACK_NAME}", got "${effectiveName}"`);
  process.exit(1);
}

console.log(`Verified: 1 MidiTrack named "${effectiveName}"`);
console.log('generate-template: OK');
