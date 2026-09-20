!include "nsDialogs.nsh"
!include "LogicLib.nsh"

Var Dialog
Var PasswordField
Var EnteredPassword

Page custom PasswordPageCreate PasswordPageLeave

Function PasswordPageCreate
    nsDialogs::Create 1018
    Pop $Dialog
    ${If} $Dialog == error
        Abort
    ${EndIf}

    ${NSD_CreateLabel} 0 10u 100% 20u "Please enter the authorization password to install PakKhatta:"
    Pop $0

    ${NSD_CreatePassword} 0 35u 100% 14u ""
    Pop $PasswordField
    SendMessage $PasswordField ${EM_SETLIMITTEXT} 50 0
    ${NSD_SetFocus} $PasswordField
    nsDialogs::Show
FunctionEnd

Function PasswordPageLeave
    ${NSD_GetText} $PasswordField $EnteredPassword

trimLeadingWhitespace:
    StrCpy $0 $EnteredPassword 1
    StrCmp $0 " " trimLeadingCharacter
    StrCmp $0 "$\t" trimLeadingCharacter
    StrCmp $0 "$\r" trimLeadingCharacter
    StrCmp $0 "$\n" trimLeadingCharacter
    Goto trimTrailingWhitespace

trimLeadingCharacter:
    StrCpy $EnteredPassword $EnteredPassword "" 1
    Goto trimLeadingWhitespace

trimTrailingWhitespace:
    StrLen $1 $EnteredPassword
    IntCmp $1 0 passwordValueTrimmed
    IntOp $1 $1 - 1
    StrCpy $0 $EnteredPassword 1 $1
    StrCmp $0 " " trimTrailingCharacter
    StrCmp $0 "$\t" trimTrailingCharacter
    StrCmp $0 "$\r" trimTrailingCharacter
    StrCmp $0 "$\n" trimTrailingCharacter
    Goto passwordValueTrimmed

trimTrailingCharacter:
    StrCpy $EnteredPassword $EnteredPassword $1
    Goto trimTrailingWhitespace

passwordValueTrimmed:
    StrCmp $EnteredPassword "229170" passwordMatches passwordFailed

passwordMatches:
    Return

passwordFailed:
    MessageBox MB_ICONSTOP|MB_OK "Incorrect password! Installation cancelled."
    Quit
FunctionEnd
